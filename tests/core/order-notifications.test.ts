import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { acceptOrder, escalateOrders, getMyTableOrders, getWaiterSession, guestActor, prepareBill, reopenBill, removeWaiter, removeWaiterPushSubscription, sendOrder, sendOrderNotifications, setWaiterPushSubscription, startShift, systemActor, type OrderNotification } from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

async function service() {
  const s = await scenario().venue("Lancha", { tables: 3 }).venue("Bole", { tables: 1 })
    .waiter("Sam").waiter("Hana").waiter("Mimi", { venue: "Bole" }).publishedMenu().build();
  const [one, two, three] = s.venue.tables;
  const { Sam: sam, Hana: hana, Mimi: mimi } = s.waiters;
  const at = new Date();
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [
    { tableId: one.id, waiterId: sam.waiterId }, { tableId: two.id, waiterId: hana.waiterId },
  ] }, { now: at });
  await startShift(s.owner.actor, { venueId: s.venues.Bole.id, assignments: [
    { tableId: s.venues.Bole.tables[0].id, waiterId: mimi.waiterId },
  ] }, { now: at });
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  const guest = guestActor(data.user!.id);
  const send = (tableId: string, now = at) => sendOrder(guest, {
    venueLinkToken: s.venue.linkToken, tableId, requestId: randomUUID(),
    lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
  }, { now });
  const orders = (waiter: typeof sam, now = at) => getMyTableOrders(waiter.actor, { unlockToken: waiter.unlockToken }, { now })
    .then(({ orders }) => orders);
  return { s, one, two, three, sam, hana, mimi, at, send, orders };
}

test("an unassigned Table reaches every Waiter on its Shift immediately", async () => {
  const { three, sam, hana, mimi, send, orders } = await service();
  const order = await send(three.id);
  expect(await orders(sam)).toEqual([order]);
  expect(await orders(hana)).toEqual([order]);
  expect(await orders(mimi)).toEqual([]);
});

test("an Order escalates at two minutes only while Sent, and any on-duty Waiter can accept it", async () => {
  const { s, one, two, sam, hana, mimi, at, send, orders } = await service();
  const pending = await send(one.id);
  const billed = await send(one.id);
  const handled = await send(two.id);
  const almost = new Date(at.getTime() + 119_999);
  const due = new Date(at.getTime() + 120_000);
  await acceptOrder(hana.actor, { orderId: handled.id, unlockToken: hana.unlockToken }, { now: almost });
  await acceptOrder(sam.actor, { orderId: billed.id, unlockToken: sam.unlockToken }, { now: almost });
  const billTarget = { venueId: s.venue.id, visitId: billed.visitId, unlockToken: sam.unlockToken };

  await expect(escalateOrders(sam.actor, { now: almost, venueId: s.venue.id })).rejects.toMatchObject({ code: "not_allowed" });
  await escalateOrders(systemActor, { now: almost, venueId: s.venue.id });
  expect(await orders(hana, almost)).toMatchObject([{ id: handled.id, escalatedAt: null }]);

  await prepareBill(sam.actor, billTarget, { now: almost });
  await Promise.all([escalateOrders(systemActor, { now: due, venueId: s.venue.id }), escalateOrders(systemActor, { now: due, venueId: s.venue.id })]);
  expect(await orders(hana, due)).toMatchObject([
    { id: pending.id, state: "sent", escalatedAt: due }, { id: handled.id, state: "accepted", escalatedAt: null },
  ]);
  expect(await orders(sam, due)).toMatchObject([{ id: pending.id, escalatedAt: due }, { id: billed.id, escalatedAt: null }]);
  expect(await orders(mimi, due)).toEqual([]);
  const detail = await getMyTableOrders(hana.actor, { tableId: one.id, unlockToken: hana.unlockToken }, { now: due });
  expect(detail).toMatchObject({ tableNumber: one.number, bills: [], billVisitIds: [], orders: [{ id: pending.id }] });
  await expect(acceptOrder(hana.actor, { orderId: pending.id, unlockToken: hana.unlockToken }, { now: due }))
    .rejects.toMatchObject({ reason: "billPrepared" });
  await reopenBill(sam.actor, billTarget, { now: due });
  const accepted = await acceptOrder(hana.actor, { orderId: pending.id, unlockToken: hana.unlockToken }, { now: due });
  expect(accepted).toMatchObject({ state: "accepted", acceptedByName: "Hana", escalatedAt: due });
});

function pushSubscription(name: string) {
  const key = createECDH("prime256v1");
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${randomUUID()}`,
    keys: { p256dh: key.generateKeys("base64url"), auth: randomBytes(16).toString("base64url") },
  };
}

test("device notifications follow Order routing, retry without duplicate deliveries and stop after sign-out or removal", async () => {
  const { s, one, three, sam, hana, mimi, at, send } = await service();
  const [samPush, hanaPush, mimiPush] = ["sam", "hana", "mimi"].map(pushSubscription);
  await expect(setWaiterPushSubscription(sam.actor, { subscription: samPush })).rejects.toMatchObject({ code: "not_allowed" });
  for (const [waiter, subscription] of [[sam, samPush], [hana, hanaPush], [mimi, mimiPush]] as const) {
    await setWaiterPushSubscription(waiter.actor, { subscription, unlockToken: waiter.unlockToken }, { now: at });
  }

  await expect(getWaiterSession(sam.actor, { unlockToken: sam.unlockToken })).resolves.toMatchObject({ hasPush: true });
  const assigned = await send(one.id);
  const attempts: OrderNotification[] = [];
  const deliver = async (delivery: OrderNotification) => {
    attempts.push(delivery);
    return "sent" as const;
  };
  await Promise.all([
    sendOrderNotifications(systemActor, deliver, { now: at, venueId: s.venue.id }),
    sendOrderNotifications(systemActor, deliver, { now: at, venueId: s.venue.id }),
  ]);
  expect(attempts).toMatchObject([{ orderId: assigned.id, reason: "new", subscription: samPush }]);

  const unassigned = await send(three.id);
  attempts.length = 0;
  await sendOrderNotifications(systemActor, async (delivery) => {
    attempts.push(delivery);
    return delivery.subscription.endpoint === samPush.endpoint ? "retry" : "sent";
  }, { now: at, venueId: s.venue.id });
  expect(attempts).toHaveLength(2);
  expect(attempts).toEqual(expect.arrayContaining([
    expect.objectContaining({ orderId: unassigned.id, reason: "new", subscription: samPush }),
    expect.objectContaining({ orderId: unassigned.id, reason: "new", subscription: hanaPush }),
  ]));
  attempts.length = 0;
  await sendOrderNotifications(systemActor, deliver, { now: new Date(at.getTime() + 60_000), venueId: s.venue.id });
  expect(attempts).toMatchObject([{ orderId: unassigned.id, subscription: samPush }]);

  const due = new Date(at.getTime() + 120_000);
  attempts.length = 0;
  await escalateOrders(systemActor, { now: due, venueId: s.venue.id });
  await sendOrderNotifications(systemActor, deliver, { now: due, venueId: s.venue.id });
  expect(attempts.filter(({ orderId }) => orderId === assigned.id)).toHaveLength(2);
  expect(attempts).toEqual(expect.arrayContaining([
    expect.objectContaining({ orderId: assigned.id, reason: "escalation", subscription: samPush }),
    expect.objectContaining({ orderId: assigned.id, reason: "escalation", subscription: hanaPush }),
  ]));
  expect(attempts.every(({ subscription }) => subscription.endpoint !== mimiPush.endpoint)).toBe(true);

  await send(three.id, due);
  await removeWaiterPushSubscription(sam.actor);
  await expect(getWaiterSession(sam.actor, { unlockToken: sam.unlockToken })).resolves.toMatchObject({ hasPush: false });
  await removeWaiter(s.owner.actor, { venueId: s.venue.id, waiterId: hana.waiterId }, { now: due });
  attempts.length = 0;
  await sendOrderNotifications(systemActor, deliver, { now: due, venueId: s.venue.id });
  expect(attempts).toEqual([]);
});

test("a provider can retire an expired device subscription", async () => {
  const { s, one, sam, at, send } = await service();
  const unlockToken = sam.unlockToken;
  const subscription = pushSubscription("expired");
  await setWaiterPushSubscription(sam.actor, { subscription, unlockToken }, { now: at });
  await send(one.id);
  await sendOrderNotifications(systemActor, async () => "expired", { now: at, venueId: s.venue.id });
  await expect(getWaiterSession(sam.actor, { unlockToken })).resolves.toMatchObject({ hasPush: false });
});
