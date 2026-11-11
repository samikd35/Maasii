import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, addPaymentOption, confirmPayment, getGuestOrders, getGuestVisit, getMyTableOrders, getOrderService, getPublishedMenu, guestActor,
  prepareBill, publicActor, publishMenu, reassignTable, reopenBill, removeWaiter, sendOrder, setTableActive, setVenueDishPrice, startShift, updatePaymentOption,
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
  expect(await getGuestOrders(actor, { venueLinkToken: s.venue.linkToken })).toEqual([accepted]);
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
  await expect(send(newPhone, "Macchiato", 1)).rejects.toMatchObject({ reason: "orderTableBillPrepared" });
  expect(await getGuestVisit(newPhone, venue)).toBeNull();
  await reopenBill(s.managers.Yonas.actor, target);
  expect(await getGuestVisit(first, venue)).toMatchObject({ bill: null, totalSantim: 44_000 });
  await expect(send(first, "Macchiato", 1)).resolves.toMatchObject({ visitId: accepted.visitId });
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
