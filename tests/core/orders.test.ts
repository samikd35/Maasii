import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, addPaymentOption, confirmPayment, declineOrder, flagUnconfirmedBills, getGuestOrders, getGuestPendingOrders, getGuestVisit, getMyTableOrders, getOrderService, getPreparedBills, getPublishedMenu, getVenueMenuSettings, guestActor, listVenueDishChanges,
  prepareBill, publicActor, publishMenu, reassignTable, reopenBill, removeWaiter, sendOrder, setTableActive, setVenueDishPrice, startShift, systemActor, undoOrderDecision, updatePaymentOption,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

async function guest() {
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  return guestActor(data.user!.id);
}

test("sending twice with the same request creates one Order, and another Send at that Table joins the Visit", async () => {
  const s = await scenario().venue("Lancha", { tables: 1 }).publishedMenu().build();
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [] });
  const actor = await guest();
  const venueLinkToken = s.venue.linkToken;
  const input = {
    venueLinkToken, tableId: s.venue.tables[0].id, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 2, note: "No salt" }],
  };
  const [sent, retried] = await Promise.all([sendOrder(actor, input), sendOrder(actor, input)]);
  expect(sent.state).toBe("sent");
  expect(retried).toEqual(sent);
  const other = await guest();
  await expect(sendOrder(other, input)).rejects.toMatchObject({ code: "not_allowed" });
  const [next, otherOrder] = await Promise.all([
    sendOrder(actor, { ...input, requestId: randomUUID() }),
    sendOrder(other, { ...input, requestId: randomUUID() }),
  ]);
  expect(next.id).not.toBe(sent.id);
  expect(next.visitId).toBe(sent.visitId);
  expect(otherOrder.visitId).toBe(sent.visitId);
  expect((await getGuestOrders(actor, { venueLinkToken })).map(({ id }) => id)).toEqual([sent.id, next.id]);
});

test("only the currently assigned and unlocked Waiter can see and accept a pending Order", async () => {
  const s = await scenario().venue("Lancha", { tables: 2 }).waiter("Sam").waiter("Hana").publishedMenu().build();
  const [one, two] = s.venue.tables;
  const { Sam: sam, Hana: hana } = s.waiters;
  const shift = await startShift(s.owner.actor, {
    venueId: s.venue.id,
    assignments: [{ tableId: one.id, waiterId: sam.waiterId }, { tableId: two.id, waiterId: hana.waiterId }],
  });
  const actor = await guest();
  const sent = await sendOrder(actor, {
    venueLinkToken: s.venue.linkToken, tableId: one.id, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  });
  expect(sent.waiterId).toBe(sam.waiterId);
  await expect(getMyTableOrders(sam.actor)).rejects.toMatchObject({ code: "not_allowed" });
  await expect(getMyTableOrders(sam.actor, { unlockToken: hana.unlockToken })).rejects.toMatchObject({ code: "not_allowed" });
  expect((await getMyTableOrders(sam.actor, { unlockToken: sam.unlockToken })).orders).toEqual([sent]);
  expect((await getMyTableOrders(hana.actor, { unlockToken: hana.unlockToken })).orders).toEqual([]);
  await expect(acceptOrder(hana.actor, { orderId: sent.id, unlockToken: hana.unlockToken })).rejects.toMatchObject({ code: "not_found" });

  await reassignTable(s.owner.actor, { venueId: s.venue.id, shiftId: shift.id, tableId: one.id, waiterId: hana.waiterId });
  expect((await getMyTableOrders(sam.actor, { unlockToken: sam.unlockToken })).orders).toEqual([]);
  const accepted = await acceptOrder(hana.actor, { orderId: sent.id, unlockToken: hana.unlockToken });
  expect(accepted).toMatchObject({ state: "accepted", acceptedByName: "Hana" });
  expect(await getGuestOrders(actor, { venueLinkToken: s.venue.linkToken }))
    .toMatchObject([{ id: accepted.id, state: "accepted", acceptedByName: "Hana" }]);
  expect(await getGuestOrders(await guest(), { venueLinkToken: s.venue.linkToken })).toEqual([]);
  await removeWaiter(s.owner.actor, { venueId: s.venue.id, waiterId: hana.waiterId });
  await expect(getMyTableOrders(hana.actor, { unlockToken: hana.unlockToken })).rejects.toMatchObject({ code: "not_allowed" });
});

test("Venue Link lists only active Tables and Send requires a running Shift", async () => {
  const s = await scenario().venue("Lancha", { tables: 2 }).venue("Bole").publishedMenu().build();
  const [table, inactive] = s.venue.tables;
  const { linkToken: venueLinkToken } = s.venue;
  await setTableActive(s.owner.actor, { tableId: inactive.id, active: false });
  expect(await getOrderService(publicActor, { venueLinkToken })).toEqual({ available: false, tables: [table] });
  const actor = await guest();
  const send = {
    venueLinkToken, tableId: table.id, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  };
  await expect(sendOrder(actor, send)).rejects.toMatchObject({ reason: "noRunningShift" });
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [] });
  await expect(sendOrder(actor, { ...send, tableId: inactive.id })).rejects.toMatchObject({ reason: "orderTableUnavailable" });
  await expect(sendOrder(actor, { ...send, tableId: s.venues.Bole.tables[0].id })).rejects.toMatchObject({ reason: "orderTableUnavailable" });
});

test("Order lines keep bilingual Dish and option snapshots and the exact Venue price after another publish", async () => {
  const s = await scenario().publishedMenu({
    sections: [{
      name: "Breakfast",
      dishes: [{
        name: { en: "Omelette", am: "ኦምሌት" }, priceSantim: 22_000,
        optionGroups: [{
          name: "Extras", kind: "add_extras",
          choices: [{ name: { en: "Cheese", am: "አይብ" }, priceChangeSantim: 4001 }],
        }],
      }],
    }],
  }).build();
  const { linkToken: venueLinkToken, id: venueId } = s.venue;
  const published = (await getPublishedMenu(publicActor, { venueLinkToken }))!;
  const [dish] = published.sections[0].dishes;
  const [choice] = dish.optionGroups[0].choices;
  await startShift(s.owner.actor, { venueId, assignments: [] });
  await setVenueDishPrice(s.owner.actor, { venueId, dishId: dish.id, priceSantim: 24_999 });

  const actor = await guest();
  const sent = await sendOrder(actor, {
    venueLinkToken, tableId: s.venue.tables[0].id, requestId: randomUUID(),
    lines: [{ dishId: dish.id, choiceIds: [choice.id], quantity: 2, note: "No salt" }],
  });
  await publishMenu(s.owner.actor, { brandId: s.brand.id, menu: {
    sections: [{ name: "Breakfast", dishes: [{ dishId: dish.id, name: "Fresh Omelette", priceSantim: 31_000 }] }],
  } });
  expect((await getGuestOrders(actor, { venueLinkToken }))[0]).toEqual(sent);
  expect(sent.lines).toEqual([{
    dishId: dish.id, name: { en: "Omelette", am: "ኦምሌት" }, unitPriceSantim: 29_000,
    choices: [{ id: choice.id, name: { en: "Cheese", am: "አይብ" }, priceChangeSantim: 4001 }],
    quantity: 2, note: "No salt",
  }]);
});

test("phones at one Table share the Visit and only Accepted Orders count toward its Bill", async () => {
  const s = await scenario().venue("Lancha", { tables: 2 }).venue("Bole").waiter("Sam").publishedMenu().build();
  const [table, otherTable] = s.venue.tables;
  const sam = s.waiters.Sam;
  await startShift(s.owner.actor, {
    venueId: s.venue.id, assignments: [{ tableId: table.id, waiterId: sam.waiterId }],
  });
  const [first, second, elsewhere] = await Promise.all([guest(), guest(), guest()]);
  const venue = { venueLinkToken: s.venue.linkToken };
  const at = new Date();
  const send = (actor: typeof first, tableId: string, dish: string, quantity: number) => sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId(dish), choiceIds: [], quantity, note: "" }],
  }, { now: at });

  const omelette = await send(first, table.id, "Omelette", 2);
  expect(await getGuestVisit(publicActor, venue)).toBeNull();
  expect(await getGuestVisit(second, venue)).toBeNull();
  const macchiato = await send(elsewhere, otherTable.id, "Macchiato", 1);
  const chechebsa = await send(second, table.id, "Chechebsa", 1);
  expect(await getGuestVisit(first, { venueLinkToken: s.venues.Bole.linkToken })).toBeNull();
  expect(await getGuestVisit(elsewhere, venue)).toMatchObject({ orders: [macchiato], totalSantim: 0 });
  expect(await getGuestVisit(first, venue)).toMatchObject({
    id: omelette.visitId, table, totalSantim: 0,
    orders: expect.arrayContaining([omelette, { ...chechebsa, requestId: null }]),
  });
  expect(await getGuestVisit(second, venue)).toMatchObject({
    id: omelette.visitId, table, totalSantim: 0,
    orders: expect.arrayContaining([{ ...omelette, requestId: null }, chechebsa]),
  });

  await acceptOrder(sam.actor, { orderId: omelette.id, unlockToken: sam.unlockToken });
  expect(await getGuestVisit(first, venue)).toMatchObject({ totalSantim: 44_000 });
  expect(await getGuestVisit(second, venue)).toMatchObject({ totalSantim: 44_000 });
  await acceptOrder(sam.actor, { orderId: chechebsa.id, unlockToken: sam.unlockToken });
  expect(await getGuestVisit(first, venue)).toMatchObject({ totalSantim: 63_000 });
  expect(await getGuestVisit(second, venue)).toMatchObject({ totalSantim: 63_000 });
  expect(await getGuestVisit(elsewhere, venue)).toMatchObject({ orders: [macchiato], totalSantim: 0 });

  const later = await send(elsewhere, table.id, "Macchiato", 1);
  expect(later.visitId).toBe(omelette.visitId);
  await expect(sendOrder(elsewhere, {
    ...venue, tableId: otherTable.id, requestId: macchiato.requestId,
    lines: [{ dishId: s.dishId("Macchiato"), choiceIds: [], quantity: 1, note: "" }],
  })).resolves.toEqual(macchiato);
  expect(await getGuestVisit(elsewhere, venue)).toMatchObject({ id: omelette.visitId, totalSantim: 63_000 });
  expect((await getGuestVisit(elsewhere, venue))?.orders.map(({ id }) => id).sort())
    .toEqual([omelette.id, chechebsa.id, later.id].sort());
});

test("a prepared Bill freezes accepted lines and blocks Send from a phone in that Visit", async () => {
  const s = await scenario().manager("Yonas").waiter("Sam").waiter("Hana").publishedMenu().build();
  const { Sam: sam, Hana: hana } = s.waiters;
  const tableId = s.venue.tables[0].id;
  const venue = { venueLinkToken: s.venue.linkToken };
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [{ tableId, waiterId: sam.waiterId }] });
  const [first, second] = await Promise.all([guest(), guest()]);
  const send = (actor: typeof first, dish: string, quantity: number) => sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId(dish), choiceIds: [], quantity, note: "" }],
  });
  const accepted = await send(first, "Omelette", 2);
  const pending = await send(second, "Chechebsa", 1);
  await acceptOrder(sam.actor, { orderId: accepted.id, unlockToken: sam.unlockToken });

  const target = { venueId: s.venue.id, visitId: accepted.visitId };
  const waiter = { ...target, unlockToken: sam.unlockToken };
  await expect(prepareBill(hana.actor, { ...target, unlockToken: hana.unlockToken })).rejects.toMatchObject({ code: "not_allowed" });
  await prepareBill(sam.actor, waiter);
  for (const actor of [first, second]) {
    const visit = await getGuestVisit(actor, venue);
    expect(visit).toMatchObject({
      bill: { lines: [{ quantity: 2, unitPriceSantim: 22_000 }], totalSantim: 44_000 },
      closedAt: null,
    });
    await expect(send(actor, "Macchiato", 1)).rejects.toMatchObject({ reason: "billPrepared" });
  }
  await expect(acceptOrder(sam.actor, { orderId: pending.id, unlockToken: sam.unlockToken })).rejects.toMatchObject({ reason: "billPrepared" });
  const newPhone = await guest();
  await expect(send(newPhone, "Macchiato", 1)).resolves.toMatchObject({ partyPending: true });
  expect(await getGuestVisit(newPhone, venue)).toBeNull();
  await reopenBill(s.managers.Yonas.actor, target);
  expect(await getGuestVisit(first, venue)).toMatchObject({ bill: null, totalSantim: 44_000 });
  await expect(send(first, "Macchiato", 1)).resolves.toMatchObject({ visitId: accepted.visitId });
});

test("partial acceptance keeps the Order snapshot, hides the Dropped Dish at that Venue, and excludes it from the Bill", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const tableId = s.venue.tables[0].id;
  const venueId = s.venue.id;
  const venue = { venueLinkToken: s.venue.linkToken };
  const omelette = s.dishId("Omelette");
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] });
  await setVenueDishPrice(s.owner.actor, { venueId, dishId: omelette, priceSantim: 24_999 });
  const actor = await guest();
  const sent = await sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [
      { dishId: omelette, choiceIds: [], quantity: 2, note: "No salt" },
      { dishId: s.dishId("Chechebsa"), choiceIds: [], quantity: 1, note: "" },
    ],
  });
  const decision = { orderId: sent.id, unlockToken: sam.unlockToken };
  await expect(acceptOrder(sam.actor, { ...decision, soldOutLineIndices: [0, 1] }))
    .rejects.toMatchObject({ reason: "orderAllLinesDropped" });
  const accepted = await acceptOrder(sam.actor, { ...decision, soldOutLineIndices: [0] });
  expect(accepted.lines).toEqual([{ ...sent.lines[0], dropReason: "sold_out" }, sent.lines[1]]);
  expect(await getGuestVisit(actor, venue)).toMatchObject({
    orders: [{ id: accepted.id, state: "accepted", lines: accepted.lines }], totalSantim: 19_000,
  });

  const dishIds = async (venueLinkToken: string) =>
    (await getPublishedMenu(publicActor, { venueLinkToken }))?.sections.flatMap((section) => section.dishes.map(({ id }) => id));
  expect(await dishIds(s.venue.linkToken)).not.toContain(omelette);
  expect(await dishIds(s.venues.Bole.linkToken)).toContain(omelette);
  const settings = await getVenueMenuSettings(s.owner.actor, { venueId });
  expect(settings.sections.flatMap(({ dishes }) => dishes)).toContainEqual(expect.objectContaining({
    id: omelette, soldOut: true, venuePriceSantim: 24_999,
  }));
  expect((await listVenueDishChanges(s.owner.actor, { venueId }))[0]).toMatchObject({
    dishId: omelette, actorUserId: sam.actor.userId, changedAt: accepted.acceptedAt, soldOut: true, priceSantim: 24_999,
  });

  await prepareBill(sam.actor, { venueId, visitId: sent.visitId, unlockToken: sam.unlockToken });
  expect(await getGuestVisit(actor, venue)).toMatchObject({
    bill: { lines: [sent.lines[1]], totalSantim: 19_000 },
  });
});

test("Declined Orders stay visible to their guests and the last Decline frees the Table", async () => {
  const s = await scenario().waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const tableId = s.venue.tables[0].id;
  const venue = { venueLinkToken: s.venue.linkToken };
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [{ tableId, waiterId: sam.waiterId }] });
  const [first, second, next] = await Promise.all([guest(), guest(), guest()]);
  const send = (actor: typeof first) => sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  });
  const initial = await send(first);
  const pending = await send(second);
  await declineOrder(sam.actor, { orderId: initial.id, unlockToken: sam.unlockToken });
  expect(await getGuestVisit(first, venue)).toMatchObject({ id: initial.visitId, closedAt: null, totalSantim: 0 });

  await declineOrder(sam.actor, { orderId: pending.id, unlockToken: sam.unlockToken });
  for (const actor of [first, second]) {
    expect(await getGuestVisit(actor, venue)).toMatchObject({
      id: initial.visitId, closedAt: expect.any(Date), totalSantim: 0,
      orders: [{ state: "declined" }, { state: "declined" }],
    });
  }
  expect((await getMyTableOrders(sam.actor, { unlockToken: sam.unlockToken })).orders).toEqual([]);
  const nextOrder = await send(next);
  expect(nextOrder.visitId).not.toBe(initial.visitId);
  expect(await getGuestVisit(next, venue)).toMatchObject({ orders: [nextOrder] });
});

test("Undo reopens an all-declined Visit, but a later party keeps its own Visit", async () => {
  const s = await scenario().waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const tableId = s.venue.tables[0].id;
  const venue = { venueLinkToken: s.venue.linkToken };
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [{ tableId, waiterId: sam.waiterId }] });
  const [first, next] = await Promise.all([guest(), guest()]);
  const send = (actor: typeof first) => sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  });
  const sent = await send(first);
  const target = { orderId: sent.id, unlockToken: sam.unlockToken };
  const declined = await declineOrder(sam.actor, target);
  const undo = { ...target, decisionId: declined.decisionId };
  await expect(undoOrderDecision(sam.actor, undo, { now: declined.undoUntil })).rejects.toMatchObject({ reason: "orderUndoExpired" });
  const at = new Date(declined.undoUntil.getTime() - 1);
  await expect(undoOrderDecision(sam.actor, undo, { now: at })).resolves.toEqual(sent);
  expect(await getGuestVisit(first, venue)).toMatchObject({ id: sent.visitId, closedAt: null, orders: [sent], totalSantim: 0 });

  const declinedAgain = await declineOrder(sam.actor, target, { now: at });
  await expect(undoOrderDecision(sam.actor, undo, { now: at })).rejects.toMatchObject({ reason: "orderAlreadyDecided" });
  const nextOrder = await send(next);
  expect(nextOrder.visitId).not.toBe(sent.visitId);
  await expect(undoOrderDecision(sam.actor, { ...target, decisionId: declinedAgain.decisionId }, { now: at }))
    .rejects.toMatchObject({ reason: "orderTableOccupied" });
  expect(await getGuestVisit(first, venue)).toMatchObject({ closedAt: expect.any(Date), orders: [{ state: "declined" }] });
  expect(await getGuestVisit(next, venue)).toMatchObject({ closedAt: null, orders: [nextOrder] });
});

test("Undo of partial acceptance restores the Sent snapshot and Bill total until the Bill is prepared", async () => {
  const s = await scenario().waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const tableId = s.venue.tables[0].id;
  const venueId = s.venue.id;
  const venue = { venueLinkToken: s.venue.linkToken };
  const omelette = s.dishId("Omelette");
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] });
  const actor = await guest();
  const sent = await sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [
      { dishId: omelette, choiceIds: [], quantity: 2, note: "" },
      { dishId: s.dishId("Chechebsa"), choiceIds: [], quantity: 1, note: "" },
    ],
  });
  const decision = { orderId: sent.id, unlockToken: sam.unlockToken, soldOutLineIndices: [0] };
  const accepted = await acceptOrder(sam.actor, decision);
  const at = new Date(accepted.undoUntil.getTime() - 1);
  await expect(undoOrderDecision(sam.actor, { ...decision, decisionId: accepted.decisionId }, { now: at })).resolves.toEqual(sent);
  expect(await getGuestVisit(actor, venue)).toMatchObject({ orders: [sent], totalSantim: 0 });
  const settings = await getVenueMenuSettings(s.owner.actor, { venueId });
  expect(settings.sections.flatMap(({ dishes }) => dishes)).toContainEqual(expect.objectContaining({ id: omelette, soldOut: true }));

  const acceptedAgain = await acceptOrder(sam.actor, decision, { now: at });
  await prepareBill(sam.actor, { venueId, visitId: sent.visitId, unlockToken: sam.unlockToken }, { now: at });
  await expect(undoOrderDecision(sam.actor, { ...decision, decisionId: acceptedAgain.decisionId }, { now: at }))
    .rejects.toMatchObject({ reason: "billPrepared" });
  expect(await getGuestVisit(actor, venue)).toMatchObject({ bill: { totalSantim: 19_000 }, orders: [{ state: "accepted" }] });
});

test.each([22_000, 21_989])("Payment Confirmation closes the Visit and preserves its Bill when the receipt is %i santim", async (receiptAmountSantim) => {
  const s = await scenario().venue("Lancha").venue("Bole").waiter("Sam").publishedMenu().build();
  const { Sam: sam } = s.waiters;
  const { id: venueId, linkToken: venueLinkToken } = s.venue;
  const tableId = s.venue.tables[0].id;
  const venue = { venueLinkToken };
  const paymentOption = (provider: string, displayOrder: number, targetVenue = venueId) => addPaymentOption(s.owner.actor, {
    venueId: targetVenue, kind: "bank_transfer", provider, recipientName: "Lancha", accountOrMerchantCode: "1937", displayOrder,
  });
  const bank = await paymentOption("Bank", 2);
  const firstOption = await paymentOption("First option", 1);
  const inactive = await paymentOption("Inactive", 3);
  const otherVenue = await paymentOption("Elsewhere", 1, s.venues.Bole.id);
  await updatePaymentOption(s.owner.actor, {
    venueId, paymentOptionId: inactive.id, revision: inactive.revision, changes: { active: false },
  });
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] });

  const [first, second, next] = await Promise.all([guest(), guest(), guest()]);
  const send = (actor: typeof first, dish: string) => sendOrder(actor, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId(dish), choiceIds: [], quantity: 1, note: "" }],
  });
  const order = await send(first, "Omelette");
  await send(second, "Macchiato");
  const target = { venueId, visitId: order.visitId, unlockToken: sam.unlockToken };
  await acceptOrder(sam.actor, { orderId: order.id, unlockToken: sam.unlockToken });
  expect((await getGuestVisit(first, venue))?.paymentOptions).toEqual([]);
  await prepareBill(sam.actor, target);
  expect((await getGuestVisit(first, venue))?.paymentOptions.map(({ id }) => id)).toEqual([firstOption.id, bank.id]);
  const input = { ...target, paymentOptionId: receiptAmountSantim === 22_000 ? null : bank.id, receiptAmountSantim };
  await expect(confirmPayment(sam.actor, { ...input, paymentOptionId: otherVenue.id })).rejects.toMatchObject({ code: "invalid_input" });
  await expect(confirmPayment(sam.actor, { ...input, paymentOptionId: inactive.id })).rejects.toMatchObject({ code: "invalid_input" });
  const [paid, replay] = await Promise.all([
    confirmPayment(sam.actor, input),
    confirmPayment(sam.actor, input),
  ]);
  expect(paid).toMatchObject({
    visitId: order.visitId, receiptAmountSantim, billTotalSantim: 22_000,
    differenceSantim: receiptAmountSantim === 22_000 ? 0 : -11,
    confirmedBy: sam.actor.userId, confirmedAt: expect.any(Date),
    method: receiptAmountSantim === 22_000 ? { kind: "cash", paymentOptionId: null } : {
      kind: "bank_transfer", paymentOptionId: bank.id, provider: "Bank", recipientName: "Lancha", accountOrMerchantCode: "1937",
    },
  });
  expect(replay).toEqual(paid);
  expect((await getMyTableOrders(sam.actor, { unlockToken: sam.unlockToken })).orders).toEqual([]);
  expect(await getGuestVisit(next, venue)).toBeNull();
  const newOrder = await send(next, "Chechebsa");
  expect(newOrder.visitId).not.toBe(order.visitId);
  expect(await getGuestVisit(next, venue)).toMatchObject({ orders: [newOrder], bill: null, closedAt: null });
  for (const actor of [first, second]) {
    expect(await getGuestVisit(actor, venue)).toMatchObject({
      id: order.visitId, closedAt: paid.confirmedAt,
      bill: { totalSantim: 22_000 }, paymentOptions: [],
    });
  }
});

test.each(["previous party paid", "same party"] as const)("a Waiter resolves %s at a prepared Table", async (resolution) => {
  const s = await scenario().waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const venueId = s.venue.id;
  const tableId = s.venue.tables[0].id;
  const venue = { venueLinkToken: s.venue.linkToken };
  const unlock = { unlockToken: sam.unlockToken };
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] });

  const [original, next] = await Promise.all([guest(), guest()]);
  const request = {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  };
  const originalOrder = await sendOrder(original, request);
  await acceptOrder(sam.actor, { orderId: originalOrder.id, ...unlock });
  const target = { venueId, visitId: originalOrder.visitId, ...unlock };
  const preparedAt = new Date();
  await prepareBill(sam.actor, target, { now: preparedAt });
  const due = new Date(preparedAt.getTime() + 20 * 60_000);
  await flagUnconfirmedBills(systemActor, { venueId, now: new Date(due.getTime() - 1) });
  expect(await getPreparedBills(s.owner.actor, { venueId })).toMatchObject([{ reminder: false }]);
  await flagUnconfirmedBills(systemActor, { venueId, now: due });
  expect(await getPreparedBills(s.owner.actor, { venueId })).toMatchObject([{ reminder: true }]);
  expect(await getMyTableOrders(sam.actor, unlock, { now: due })).toMatchObject({ bills: [{ reminder: true }] });

  const nextRequest = { ...request, requestId: randomUUID() };
  const pending = await sendOrder(next, nextRequest, { now: due });
  expect(pending.partyPending).toBe(true);
  expect(await sendOrder(next, nextRequest, { now: due })).toEqual(pending);
  expect(await getGuestPendingOrders(next, venue)).toEqual([pending]);
  expect(await getGuestVisit(next, venue)).toBeNull();
  expect((await getGuestVisit(original, venue))?.orders).toEqual([expect.objectContaining({ id: originalOrder.id })]);
  expect((await getMyTableOrders(sam.actor, unlock, { now: due })).orders).toContainEqual(pending);

  if (resolution === "previous party paid") {
    await confirmPayment(sam.actor, { ...target, paymentOptionId: null, receiptAmountSantim: 22_000 }, { now: due });
    expect(await getGuestVisit(original, venue)).toMatchObject({ closedAt: due, bill: { totalSantim: 22_000 } });
    expect((await getGuestVisit(next, venue))?.id).not.toBe(originalOrder.visitId);
    expect((await getGuestVisit(next, venue))?.orders).toEqual([expect.objectContaining({ id: pending.id, partyPending: false })]);
  } else {
    await reopenBill(sam.actor, target, { now: due });
    for (const actor of [original, next]) {
      expect(await getGuestVisit(actor, venue)).toMatchObject({
        id: originalOrder.visitId, closedAt: null, bill: null,
        orders: expect.arrayContaining([expect.objectContaining({ id: pending.id, partyPending: false })]),
      });
    }
  }
  expect(await getGuestPendingOrders(next, venue)).toEqual([]);
  expect(await getPreparedBills(s.owner.actor, { venueId })).toEqual([]);
});

test("the Waiter queue puts ordinary Sent Orders ahead of new parties and Bills to settle", async () => {
  const s = await scenario().venue("Lancha", { tables: 4 }).waiter("Sam").publishedMenu().build();
  const { id: venueId, linkToken: venueLinkToken, tables } = s.venue;
  const sam = s.waiters.Sam;
  const unlock = { unlockToken: sam.unlockToken };
  const start = Date.now() - 30 * 60_000;
  const at = (minutes: number) => ({ now: new Date(start + minutes * 60_000) });
  await startShift(s.owner.actor, { venueId, assignments: tables.map(({ id }) => ({ tableId: id, waiterId: sam.waiterId })) }, at(0));
  const send = async (index: number, minutes: number) => sendOrder(await guest(), {
    venueLinkToken, tableId: tables[index].id, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  }, at(minutes));

  const inService = await send(0, 1);
  const settling = await send(1, 2);
  for (const order of [inService, settling]) await acceptOrder(sam.actor, { orderId: order.id, ...unlock }, at(3));
  await prepareBill(sam.actor, { venueId, visitId: settling.visitId, ...unlock }, at(4));
  await flagUnconfirmedBills(systemActor, { venueId, now: at(24).now });

  const party = await send(1, 24);
  const oldest = await send(2, 25);
  const newest = await send(3, 26);
  const feed = await getMyTableOrders(sam.actor, unlock, at(26));
  expect(feed.orders.map(({ id }) => id)).toEqual([oldest.id, newest.id, party.id, settling.id, inService.id]);
});
