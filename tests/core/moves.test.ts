import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, changeGuestTable, getGuestVisit, getMoveHistory, getMyTableOrders, guestActor, moveOrder, moveVisit,
  prepareBill, sendOrder, startShift,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

test("Order moves reroute the Guest and Waiter, and a whole Visit carries its prepared Bill", async () => {
  const s = await scenario().venue("Lancha", { tables: 4 }).waiter("Sam").waiter("Hana").publishedMenu().build();
  const { id: venueId, tables: [one, two, three, four], linkToken: venueLinkToken } = s.venue;
  const sam = s.waiters.Sam;
  const hana = s.waiters.Hana;
  const auth = (waiter: typeof sam) => ({ unlockToken: waiter.unlockToken });
  await startShift(s.owner.actor, { venueId, assignments: [
    { tableId: one.id, waiterId: sam.waiterId }, { tableId: two.id, waiterId: hana.waiterId },
    { tableId: three.id, waiterId: sam.waiterId }, { tableId: four.id, waiterId: hana.waiterId },
  ] });
  const guest = async () => {
    const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
    if (error) throw error;
    return guestActor(data.user!.id);
  };
  const first = await guest();
  const second = await guest();
  const send = (who: typeof first, tableId: string) => sendOrder(who, { venueLinkToken, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  });
  const sent = await send(first, one.id);
  const join = await send(second, two.id);
  await expect(moveOrder(hana.actor, { ...auth(hana), orderId: sent.id, tableId: two.id })).rejects.toMatchObject({ code: "not_allowed" });
  await moveOrder(sam.actor, { ...auth(sam), orderId: sent.id, tableId: two.id });
  expect((await getMyTableOrders(sam.actor, auth(sam))).orders).toEqual([]);
  expect((await getMyTableOrders(hana.actor, auth(hana))).orders).toMatchObject([
    { id: sent.id, visitId: join.visitId, tableId: two.id, waiterName: "Hana" },
    { id: join.id },
  ]);
  expect(await getGuestVisit(first, { venueLinkToken })).toMatchObject({ id: join.visitId, table: two, canChangeTable: true });

  await changeGuestTable(first, { venueLinkToken, tableId: three.id });
  const chosen = await getGuestVisit(first, { venueLinkToken });
  expect(chosen).toMatchObject({ table: three, orders: [{ id: sent.id }] });
  expect((await getGuestVisit(second, { venueLinkToken }))?.orders.map(({ id }) => id)).toEqual([join.id]);
  await acceptOrder(sam.actor, { ...auth(sam), orderId: sent.id });
  await expect(changeGuestTable(first, { venueLinkToken, tableId: four.id })).rejects.toMatchObject({ reason: "tableChoiceLocked" });
  await expect(send(first, four.id)).rejects.toMatchObject({ reason: "tableChoiceLocked" });

  const visitId = chosen!.id;
  await expect(moveVisit(sam.actor, { ...auth(sam), visitId, tableId: two.id })).rejects.toMatchObject({ reason: "orderTableOccupied" });
  await prepareBill(sam.actor, { ...auth(sam), venueId, visitId });
  const bill = (await getGuestVisit(first, { venueLinkToken }))!.bill!;
  await expect(moveOrder(sam.actor, { ...auth(sam), orderId: sent.id, tableId: four.id })).rejects.toMatchObject({ reason: "billPrepared" });
  await moveVisit(sam.actor, { ...auth(sam), visitId, tableId: four.id });
  expect(await getGuestVisit(first, { venueLinkToken })).toMatchObject({
    id: visitId, table: four, bill: { totalSantim: bill.totalSantim, preparedAt: bill.preparedAt },
  });
  expect((await getMyTableOrders(hana.actor, auth(hana))).orders).toContainEqual(expect.objectContaining({
    id: sent.id, visitId, tableId: four.id, acceptedByName: "Sam",
  }));
  expect(await getMoveHistory(s.owner.actor, { venueId })).toMatchObject([
    { orderId: sent.id, fromVisitId: sent.visitId, toVisitId: join.visitId, changedBy: sam.actor.userId, changedAt: expect.any(Date) },
    { orderId: sent.id, fromVisitId: join.visitId, toVisitId: visitId, changedBy: first.userId, changedAt: expect.any(Date) },
    { orderId: null, fromVisitId: visitId, toVisitId: visitId, changedBy: sam.actor.userId, changedAt: expect.any(Date) },
  ]);
});
