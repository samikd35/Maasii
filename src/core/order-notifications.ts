import { ECDH, randomUUID } from "node:crypto";
import { z } from "zod";
import { systemActor, type Actor } from "./actor";
import { inTransaction } from "./db";
import { MaasiiError } from "./errors";
import type { Language } from "./language";
import { parseInput } from "./validation";
import { requireOrderWaiter } from "./waiters";

const endpoint = z.url({ protocol: /^https$/, normalize: true }).max(2048).refine((value) => {
  const url = new URL(value);
  return !url.port && !url.username && !url.password && !url.hash && (
    url.hostname === "fcm.googleapis.com" ||
    url.hostname === "updates.push.services.mozilla.com" ||
    url.hostname.endsWith(".push.apple.com")
  );
});

const p256dh = z.string().regex(/^[A-Za-z0-9_-]{87}$/).refine((value) => {
  try {
    ECDH.convertKey(value, "prime256v1", "base64url");
    return true;
  } catch {
    return false;
  }
});

const subscriptionInput = z.object({
  endpoint,
  keys: z.object({ p256dh, auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }),
});

export type OrderNotification = {
  orderId: string;
  tableId: string;
  tableNumber: number;
  language: Language;
  reason: "new" | "escalation" | "bill-reminder";
  subscription: z.output<typeof subscriptionInput>;
};

export async function setWaiterPushSubscription(
  actor: Actor, input: { subscription: unknown; unlockToken?: string }, { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  const subscription = parseInput(subscriptionInput, input.subscription);
  await inTransaction(actor, async (tx) => {
    await requireOrderWaiter(tx, actor, input.unlockToken, now);
    await tx.query("select app.register_waiter_push($1, $2)", [subscription.endpoint, subscription.keys]);
  });
}

/** Sign-out may be called after PIN lock. The verified Auth session still owns this device. */
export async function removeWaiterPushSubscription(actor: Actor): Promise<void> {
  if (actor.kind !== "staff" || !actor.sessionId) return;
  await inTransaction(systemActor, async (tx) => {
    await tx.query(
      `delete from app.waiter_push_subscriptions p using app.waiter_devices d, app.memberships m
       where p.session_id = d.session_id and m.id = d.waiter_id and d.session_id = $1 and m.user_id = $2`,
      [actor.sessionId, actor.userId],
    );
  });
}

export async function consumeOrderNotificationWake(actor: Actor, token: string): Promise<boolean> {
  if (actor.kind !== "system") throw new MaasiiError("not_allowed", "Only the notification job consumes wake tokens.");
  if (!z.uuid().safeParse(token).success) return false;
  return inTransaction(actor, async (tx) => {
    const { rowCount } = await tx.query(
      "delete from app.order_notification_wakes where token = $1 and expires_at > now()",
      [token],
    );
    return rowCount === 1;
  });
}

type DeliveryResult = "sent" | "expired" | "retry";

export async function sendOrderNotifications(
  actor: Actor, send: (notification: OrderNotification) => Promise<DeliveryResult>,
  { now = new Date(), venueId }: { now?: Date; venueId?: string } = {},
): Promise<void> {
  if (actor.kind !== "system") throw new MaasiiError("not_allowed", "Only the notification job sends push messages.");
  const venue = parseInput(z.uuid().optional(), venueId);
  const lease = randomUUID();

  // Claim and commit before contacting providers. A crashed worker leaves rows due again in one minute.
  // ponytail: 24 per wake. Add a bounded drain loop if a minute's retry backlog can exceed this batch.
  const notifications = await inTransaction(actor, async (tx) => {
    const { rows } = await tx.query<OrderNotification & { deliveryId: string }>(
      `with due as (
         select q.id, o.id as "orderId", o.table_id as "tableId", o.table_number as "tableNumber",
                coalesce(l.language, 'am') as language, q.reason, jsonb_build_object('endpoint', p.endpoint, 'keys', p.keys) as subscription
         from app.order_push_deliveries q
         join app.waiter_push_subscriptions p on p.id = q.subscription_id
         join app.waiter_devices d on d.session_id = p.session_id
         join app.memberships m on m.id = d.waiter_id
         join app.orders o on o.id = q.order_id
         join app.visits v on v.id = o.visit_id
         left join app.staff_preferences l on l.user_id = m.user_id
         where ($3::uuid is null or o.venue_id = $3)
           and q.next_attempt_at <= $2 and v.closed_at is null and m.active and d.failed_attempts < 5
           and ((q.reason = 'bill-reminder' and v.bill_reminded_at is not null and v.bill_prepared_at is not null)
             or (q.reason <> 'bill-reminder' and o.state = 'sent'))
           and m.id in (select app.order_alert_waiters(o.venue_id, o.table_id, $2, q.reason = 'escalation'))
         order by q.next_attempt_at, q.id limit 24 for update of q skip locked
       )
       update app.order_push_deliveries q set lease_id = $1, next_attempt_at = $2::timestamptz + interval '1 minute'
       from due where q.id = due.id
       returning q.id as "deliveryId", due."orderId", due."tableId", due."tableNumber", due.language, due.reason, due.subscription`,
      [lease, now, venue ?? null],
    );
    return rows;
  });
  if (!notifications.length) return;

  const results = await Promise.all(notifications.map(async ({ deliveryId, ...notification }) => ({
    deliveryId, result: await send(notification).catch(() => "retry" as const),
  })));
  await inTransaction(actor, async (tx) => {
    await tx.query(
      `delete from app.waiter_push_subscriptions p using app.order_push_deliveries q
       where p.id = q.subscription_id and q.lease_id = $1 and q.id = any($2::uuid[])`,
      [lease, results.filter(({ result }) => result === "expired").map(({ deliveryId }) => deliveryId)],
    );
    await tx.query(
      `update app.order_push_deliveries set next_attempt_at = null, lease_id = null
       where lease_id = $1 and id = any($2::uuid[])`,
      [lease, results.filter(({ result }) => result === "sent").map(({ deliveryId }) => deliveryId)],
    );
  });
}
