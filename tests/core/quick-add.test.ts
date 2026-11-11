import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  addWaiterOrder, correctWaiterOrderLine, getMyTableOrders, getOrderCorrections, getWaiterQuickAdd,
  prepareBill, reassignTable, startShift,
} from "@/core";
import { scenario } from "../support/scenario";

test("Waiter quick-add opens a Visit, snapshots an accepted Order, and audits only permitted corrections", async () => {
  const s = await scenario().venue("Lancha", { tables: 2 }).waiter("Sam").waiter("Hana").publishedMenu().build();
  const { id: venueId, tables: [one, two] } = s.venue;
  const sam = s.waiters.Sam;
  const hana = s.waiters.Hana;
  const shift = await startShift(s.owner.actor, { venueId, assignments: [
    { tableId: one.id, waiterId: sam.waiterId }, { tableId: two.id, waiterId: hana.waiterId },
  ] });
  const target = { tableId: one.id, unlockToken: sam.unlockToken };
  const omelette = s.dishId("Omelette");
  const request = { ...target, requestId: randomUUID(), lines: [
    { dishId: omelette, quantity: 2, choiceIds: [], note: "Well done" },
    { dishId: s.dishId("Macchiato"), quantity: 1, choiceIds: [], note: "" },
  ] };
  expect(await getMyTableOrders(sam.actor, target)).toMatchObject({ tableNumber: 1, assignedTables: [one], orders: [] });
  expect((await getWaiterQuickAdd(sam.actor, target)).dishes).toContainEqual(expect.objectContaining({
    dishId: omelette, name: { en: "Omelette", am: "ኦምሌት" },
  }));
  await expect(addWaiterOrder(sam.actor, { ...request, tableId: two.id })).rejects.toMatchObject({ code: "not_allowed" });
  const order = await addWaiterOrder(sam.actor, request);
  expect(order).toMatchObject({
    state: "accepted", source: "waiter", acceptedByName: "Sam", tableId: one.id,
    lines: [{ quantity: 2, note: "Well done", unitPriceSantim: 22_000 }, { quantity: 1 }],
  });
  expect((await addWaiterOrder(sam.actor, request)).id).toBe(order.id);
  expect((await getWaiterQuickAdd(sam.actor, target)).recent).toContain(omelette);

  const edit = { orderId: order.id, unlockToken: sam.unlockToken, lineIndex: 0, quantity: 1, reason: "Guest asked for one" };
  await reassignTable(s.owner.actor, { venueId, shiftId: shift.id, tableId: one.id, waiterId: hana.waiterId });
  await expect(correctWaiterOrderLine(hana.actor, { ...edit, unlockToken: hana.unlockToken })).rejects.toMatchObject({ code: "not_allowed" });
  await reassignTable(s.owner.actor, { venueId, shiftId: shift.id, tableId: one.id, waiterId: sam.waiterId });
  await expect(correctWaiterOrderLine(sam.actor, { ...edit, reason: " " })).rejects.toMatchObject({ code: "invalid_input" });
  await correctWaiterOrderLine(sam.actor, edit);
  await correctWaiterOrderLine(sam.actor, { ...edit, lineIndex: 1, quantity: null, reason: "Guest cancelled drink" });
  expect((await getMyTableOrders(sam.actor, target)).tableBills).toMatchObject([
    { tableId: one.id, visitId: order.visitId, totalSantim: 22_000 },
  ]);
  await prepareBill(sam.actor, { ...target, venueId, visitId: order.visitId });
  await expect(correctWaiterOrderLine(sam.actor, { ...edit, quantity: 2 })).rejects.toMatchObject({ reason: "billPrepared" });
  await expect(addWaiterOrder(sam.actor, { ...request, requestId: randomUUID() })).rejects.toMatchObject({ reason: "billPrepared" });
  expect(await getOrderCorrections(s.owner.actor, { venueId, orderId: order.id })).toMatchObject([
    { lineIndex: 0, beforeQuantity: 2, afterQuantity: 1, reason: "Guest asked for one", changedBy: sam.actor.userId },
    { lineIndex: 1, beforeQuantity: 1, afterQuantity: null, reason: "Guest cancelled drink", changedBy: sam.actor.userId },
  ]);
});
