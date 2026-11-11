import { expect, test } from "vitest";
import {
  endShift, getResponsibleWaiter, getRunningShift, getShiftSetup, publicActor, reassignTable, removeWaiter,
  setTableActive, setUsualTables, startShift,
} from "@/core";
import { scenario } from "../support/scenario";

test("a Manager saves Usual Tables and sees unambiguous defaults for active Tables", async () => {
  const s = await scenario().venue("Lancha", { tables: 4 }).venue("Bole").manager("Aster")
    .waiter("Sam").waiter("Hana").waiter("Mimi", { venue: "Bole" }).build();
  const { id: venueId, tables: [first, second, third, fourth] } = s.venue;
  const manager = s.managers.Aster.actor;
  const sam = s.waiters.Sam.waiterId;
  const hana = s.waiters.Hana.waiterId;

  await expect(setUsualTables(manager, { venueId, waiterId: s.waiters.Mimi.waiterId, tableIds: [first.id] }))
    .rejects.toMatchObject({ code: "not_found" });
  await expect(setUsualTables(manager, { venueId, waiterId: sam, tableIds: [s.venues.Bole.tables[0].id] }))
    .rejects.toMatchObject({ code: "invalid_input" });
  await expect(setUsualTables(s.waiters.Sam.actor, { venueId, waiterId: sam, tableIds: [first.id] }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await setUsualTables(manager, { venueId, waiterId: sam, tableIds: [first.id, second.id] });
  await setUsualTables(s.owner.actor, { venueId, waiterId: hana, tableIds: [second.id, third.id] });

  const setup = await getShiftSetup(manager, { venueId });
  expect(setup.shift).toBeNull();
  expect(setup.waiters).toEqual([
    { id: hana, name: "Hana", usualTableIds: [second.id, third.id] },
    { id: sam, name: "Sam", usualTableIds: [first.id, second.id] },
  ]);
  expect(setup.tables.map(({ id, waiterId }) => [id, waiterId])).toEqual([
    [first.id, sam], [second.id, null], [third.id, hana], [fourth.id, null],
  ]);
  expect(setup.unassignedTables.map(({ number }) => number)).toEqual([2, 4]);
  await setUsualTables(manager, { venueId, waiterId: sam, tableIds: [] });
  expect((await getShiftSetup(manager, { venueId })).unassignedTables.map(({ number }) => number)).toEqual([1, 4]);
});

test("starting a Shift saves the Manager's edits atomically and prevents a second running Shift", async () => {
  const s = await scenario().venue("Lancha", { tables: 3 }).venue("Bole", { tables: 1 }).manager("Aster")
    .waiter("Sam").waiter("Hana").build();
  const { id: venueId, tables: [first, second, third] } = s.venue;
  const manager = s.managers.Aster.actor;
  const sam = s.waiters.Sam.waiterId;
  const hana = s.waiters.Hana.waiterId;
  const now = new Date("2026-11-11T06:00:00.000Z");
  await setUsualTables(manager, { venueId, waiterId: sam, tableIds: [first.id, second.id] });
  await setTableActive(manager, { tableId: third.id, active: false });
  await expect(startShift(manager, { venueId, assignments: [
    { tableId: first.id, waiterId: hana }, { tableId: third.id, waiterId: sam },
  ] }, { now })).rejects.toMatchObject({ code: "invalid_input" });
  await expect(getRunningShift(manager, { venueId, at: now })).resolves.toBeNull();
  await expect(startShift(manager, { venueId, assignments: [
    { tableId: first.id, waiterId: hana }, { tableId: first.id, waiterId: sam },
  ] }, { now })).rejects.toMatchObject({ code: "invalid_input" });

  const input = { venueId, assignments: [{ tableId: first.id, waiterId: hana }] };
  const results = await Promise.allSettled([
    startShift(manager, input, { now }),
    startShift(s.owner.actor, input, { now }),
  ]);
  expect(results.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(results.find(({ status }) => status === "rejected")).toMatchObject({ reason: { reason: "shiftAlreadyRunning" } });
  const shift = await getRunningShift(manager, { venueId, at: now });
  expect(shift).toMatchObject({ startedAt: now, endedAt: null });
  const setup = await getShiftSetup(manager, { venueId });
  expect(setup.shift).toEqual(shift);
  expect(setup.tables).toEqual([{ ...first, waiterId: hana }, { ...second, waiterId: null }]);
  expect(setup.unassignedTables).toEqual([second]);
  await expect(startShift(s.owner.actor, { venueId: s.venues.Bole.id, assignments: [] }, { now }))
    .resolves.toMatchObject({ venueId: s.venues.Bole.id });
});

test("reassignment and Shift end preserve responsibility at each time, including after a Waiter is removed", async () => {
  const s = await scenario().venue("Lancha", { tables: 2 }).manager("Aster")
    .waiter("Sam").waiter("Hana").waiter("Mimi").build();
  const { id: venueId, tables: [first, second] } = s.venue;
  const manager = s.managers.Aster.actor;
  const sam = s.waiters.Sam.waiterId;
  const hana = s.waiters.Hana.waiterId;
  const mimi = s.waiters.Mimi.waiterId;
  const time = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 11, hour, minute));
  const shift = await startShift(manager, { venueId, assignments: [{ tableId: first.id, waiterId: sam }] }, { now: time(6) });
  const target = { venueId, shiftId: shift.id, tableId: first.id };
  const responsibility = (at: Date, tableId = first.id) => getResponsibleWaiter(manager, { venueId, tableId, at });

  await reassignTable(manager, { ...target, waiterId: hana }, { now: time(7) });
  await expect(responsibility(time(6, 59))).resolves.toMatchObject({ waiterId: sam, waiterName: "Sam" });
  await expect(responsibility(time(7))).resolves.toMatchObject({ waiterId: hana, waiterName: "Hana" });
  await expect(responsibility(time(5, 59))).resolves.toBeNull();
  await expect(responsibility(time(7), second.id)).resolves.toBeNull();
  await expect(getResponsibleWaiter(publicActor, { venueId, tableId: first.id, at: time(7) }))
    .rejects.toMatchObject({ code: "not_allowed" });

  await Promise.all([
    reassignTable(manager, { ...target, waiterId: sam }, { now: time(8) }),
    reassignTable(s.owner.actor, { ...target, waiterId: mimi }, { now: time(8) }),
  ]);
  const current = await responsibility(time(8));
  if (!current) throw new Error("A Waiter must be responsible after concurrent assignments.");
  expect([sam, mimi]).toContain(current.waiterId);
  await expect(responsibility(time(7, 59))).resolves.toMatchObject({ waiterId: hana });
  await expect(reassignTable(manager, { ...target, waiterId: hana }, { now: time(7, 59) }))
    .rejects.toMatchObject({ code: "invalid_input" });
  await expect(endShift(manager, { venueId, shiftId: shift.id }, { now: time(7, 59) }))
    .rejects.toMatchObject({ code: "invalid_input" });

  await removeWaiter(manager, { venueId, waiterId: current.waiterId }, { now: time(9) });
  await expect(responsibility(time(8, 59))).resolves.toMatchObject({ waiterId: current.waiterId });
  await expect(responsibility(time(9))).resolves.toBeNull();
  expect((await getShiftSetup(manager, { venueId })).unassignedTables).toContainEqual(first);
  await reassignTable(manager, { ...target, waiterId: hana }, { now: time(9, 30) });
  await endShift(manager, { venueId, shiftId: shift.id }, { now: time(10) });
  await expect(responsibility(time(9, 59))).resolves.toMatchObject({ waiterId: hana });
  await expect(responsibility(time(10))).resolves.toBeNull();
  await expect(getRunningShift(manager, { venueId, at: time(10) })).resolves.toBeNull();
  await expect(startShift(manager, { venueId, assignments: [] }, { now: time(9, 59) }))
    .rejects.toMatchObject({ code: "invalid_input" });
  const next = await startShift(manager, { venueId, assignments: [{ tableId: first.id, waiterId: hana }] }, { now: time(10) });
  await expect(endShift(manager, { venueId, shiftId: shift.id }, { now: time(11) }))
    .rejects.toMatchObject({ reason: "shiftChanged" });
  await expect(reassignTable(manager, { ...target, waiterId: hana }, { now: time(11) }))
    .rejects.toMatchObject({ reason: "shiftChanged" });
  await expect(getRunningShift(manager, { venueId, at: time(11) })).resolves.toMatchObject({ id: next.id });
});
