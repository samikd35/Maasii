import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, getGuestOrders, getGuestVisit, getMyTableOrders, getOrderService, getPublishedMenu, guestActor,
  publicActor, publishMenu, reassignTable, removeWaiter, sendOrder, setTableActive, setVenueDishPrice, startShift,
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
