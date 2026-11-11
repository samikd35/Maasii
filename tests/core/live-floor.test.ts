import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { acceptOrder, confirmPayment, getLiveFloor, guestActor, prepareBill, sendOrder, startShift } from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

test("the floor shows overdue Orders and Bills, unassigned Tables, and Receipt Differences", async () => {
  const s = await scenario().venue("Lancha", { tables: 4 }).venue("Other").manager("Hana").waiter("Sam").publishedMenu().build();
  const { id: venueId, tables, linkToken } = s.venue;
  const manager = s.managers.Hana.actor;
  const waiter = s.waiters.Sam;
  const base = new Date("2026-11-11T08:00:00Z");
  const minutes = (offset: number) => ({ now: new Date(base.getTime() + offset * 60_000) });
  await startShift(manager, { venueId, assignments: tables.slice(0, 3).map((table) => ({ tableId: table.id, waiterId: waiter.waiterId })) }, minutes(0));
  const send = async (index: number, at: number) => {
    const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
    if (error) throw error;
    return sendOrder(guestActor(data.user!.id), { venueLinkToken: linkToken, tableId: tables[index].id, requestId: randomUUID(),
      lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }] }, minutes(at));
  };
  const sent = await send(0, 19);
  const prepared = await send(1, 0);
  const paid = await send(2, 0);
  for (const order of [prepared, paid]) {
    await acceptOrder(waiter.actor, { orderId: order.id, unlockToken: waiter.unlockToken }, minutes(0));
    await prepareBill(manager, { venueId, visitId: order.visitId }, minutes(1));
  }
  await confirmPayment(manager, { venueId, visitId: paid.visitId, paymentOptionId: null, receiptAmountSantim: 21_000 }, minutes(18));

  const early = await getLiveFloor(manager, { venueId }, minutes(20));
  expect(early.exceptions.map(({ kind }) => kind)).toEqual(["unassigned", "difference"]);
  const floor = await getLiveFloor(s.owner.actor, { venueId }, minutes(21));
  expect(floor.exceptions).toEqual([
    { kind: "sent", tableNumber: 1, id: sent.visitId, minutes: 2 },
    { kind: "prepared", tableNumber: 2, id: prepared.visitId, minutes: 20 },
    { kind: "unassigned", tableNumber: 4, id: tables[3].id, minutes: 21 },
    { kind: "difference", tableNumber: 3, id: paid.visitId, minutes: 3 },
  ]);
  expect(floor.tables).toMatchObject([
    { number: 1, status: "sent", waiter: "Sam", oldestSentMinutes: 2, totalSantim: 0 },
    { number: 2, status: "prepared", waiter: "Sam", oldestSentMinutes: null, totalSantim: 22_000 },
  ]);
  expect(await getLiveFloor(s.owner.actor, { venueId: s.venues.Other.id })).toMatchObject({ tables: [], exceptions: [] });
  await expect(getLiveFloor(manager, { venueId: s.venues.Other.id })).rejects.toMatchObject({ code: "not_allowed" });
});
