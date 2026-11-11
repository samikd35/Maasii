import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, adjustVisitBill, closeVisitUnpaid, confirmPayment, endShift, getClosingReport, getGuestVisit,
  getMyTableOrders, guestActor, prepareBill, sendOrder, startShift,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

test("management corrections, daily reconciliation and carry-over use the same Visit", async () => {
  const s = await scenario().waiter("Sam").waiter("Hana").manager("Yonas").publishedMenu().build();
  const { Sam: sam, Hana: hana } = s.waiters;
  const manager = s.managers.Yonas.actor;
  const venueId = s.venue.id;
  const venue = { venueLinkToken: s.venue.linkToken };
  const table = s.venue.tables[0];
  const shift = await startShift(manager, { venueId, assignments: [{ tableId: table.id, waiterId: sam.waiterId }] });
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  const guest = guestActor(data.user!.id);
  const send = () => sendOrder(guest, {
    ...venue, tableId: table.id, requestId: randomUUID(),
    lines: ["Omelette", "Chechebsa"].map((name) => ({ dishId: s.dishId(name), choiceIds: [], quantity: 1, note: "" })),
  });
  const order = await send();
  const target = { venueId, visitId: order.visitId };
  await acceptOrder(sam.actor, { orderId: order.id, unlockToken: sam.unlockToken });

  const remove = { ...target, kind: "remove_line" as const, orderId: order.id, lineIndex: 0, reason: "Returned to the kitchen" };
  await expect(adjustVisitBill(sam.actor, remove)).rejects.toMatchObject({ code: "not_allowed" });
  await expect(adjustVisitBill(manager, { ...remove, reason: " " })).rejects.toMatchObject({ code: "invalid_input" });
  await adjustVisitBill(manager, remove);
  expect(await getGuestVisit(guest, venue)).toMatchObject({ totalSantim: 19_000 });

  await prepareBill(manager, target);
  await adjustVisitBill(manager, { ...target, kind: "discount", amountSantim: 1_000, reason: "Service recovery" });
  expect(await getGuestVisit(guest, venue)).toMatchObject({
    bill: { totalSantim: 18_000, lines: [{ dishId: s.dishId("Chechebsa") }] },
  });
  const before = await getClosingReport(manager, { venueId });
  expect(before.visits).toMatchObject([{
    id: order.visitId, tableNumber: 1, waiterName: "Sam", totalSantim: 18_000,
    adjustments: [
      { kind: "remove_line", reason: "Returned to the kitchen", changedBy: s.managers.Yonas.userId, changedAt: expect.any(Date) },
      { kind: "discount", reason: "Service recovery", changedBy: s.managers.Yonas.userId, changedAt: expect.any(Date) },
    ],
  }]);

  await endShift(manager, { venueId, shiftId: shift.id });
  await startShift(manager, { venueId, assignments: [{ tableId: table.id, waiterId: hana.waiterId }] });
  expect((await getMyTableOrders(hana.actor, { unlockToken: hana.unlockToken })).orders)
    .toMatchObject([{ id: order.id, carriedFrom: "Sam" }]);
  await confirmPayment(manager, { ...target, paymentOptionId: null, receiptAmountSantim: 17_500 });
  expect(await getClosingReport(manager, { venueId })).toMatchObject({
    visits: [], payments: [{ visitId: order.visitId, receiptAmountSantim: 17_500, differenceSantim: -500 }],
    totals: { receiptSantim: 17_500, billSantim: 18_000, differenceSantim: -500 },
  });

  const unpaid = await send();
  const unpaidTarget = { venueId, visitId: unpaid.visitId, reason: "walked_out" as const };
  await expect(closeVisitUnpaid(hana.actor, unpaidTarget)).rejects.toMatchObject({ code: "not_allowed" });
  await closeVisitUnpaid(manager, unpaidTarget);
  expect((await getClosingReport(manager, { venueId })).visits).toEqual([]);
  expect((await send()).visitId).not.toBe(unpaid.visitId);
});
