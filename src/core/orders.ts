import { z } from "zod";
import type { Actor } from "./actor";
import type { Table } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MAX_NOTE_LENGTH, MAX_QUANTITY, priceDraftLine } from "./draft";
import { MaasiiError } from "./errors";
import type { Bilingual } from "./language";
import { readPublishedMenu } from "./menu";
import { findResponsibleWaiter, findRunningShift, lockVenueShifts } from "./shifts";
import { parseInput } from "./validation";
import { tokenHash } from "./waiters";

const id = z.uuid().transform((value) => value.toLowerCase());
const venueLink = z.object({ venueLinkToken: z.string().min(1).max(200) });
const sendInput = venueLink.extend({
  tableId: id,
  requestId: id,
  lines: z.array(z.object({
    dishId: id,
    choiceIds: z.array(id).max(100),
    quantity: z.number().int().min(1).max(MAX_QUANTITY),
    note: z.string().max(MAX_NOTE_LENGTH),
  })).min(1).max(100),
});

type OrderLine = {
  dishId: string;
  name: Bilingual;
  unitPriceSantim: number;
  choices: { id: string; name: Bilingual; priceChangeSantim: number }[];
  quantity: number;
  note: string;
  dropReason?: string | null;
};

export type Order = {
  id: string;
  requestId: string;
  visitId: string;
  tableId: string;
  tableNumber: number;
  state: "sent" | "accepted";
  sentAt: Date;
  waiterId: string | null;
  waiterName: string | null;
  acceptedByName: string | null;
  acceptedAt: Date | null;
  lines: OrderLine[];
};

type GuestOrder = Omit<Order, "requestId"> & { requestId: string | null };
type GuestVisit = { id: string; table: Table; orders: GuestOrder[]; totalSantim: number };

const orderDetails = `id, visit_id as "visitId", table_id as "tableId", table_number as "tableNumber",
  state, sent_at as "sentAt",
  waiter_id as "waiterId", waiter_name as "waiterName",
  accepted_by_name as "acceptedByName", accepted_at as "acceptedAt", lines`;
const orderFields = `${orderDetails}, request_id as "requestId"`;

async function orderVenue(tx: Tx, token: string): Promise<string> {
  const { rows: [venue] } = await tx.query<{ id: string }>("select id from app.venues where link_token = $1", [token]);
  if (!venue) throw new MaasiiError("not_found", "Venue Link not found.");
  await tx.query("select set_config('app.order_venue_token', $1, true)", [token]);
  return venue.id;
}

export async function getOrderService(
  actor: Actor, input: z.input<typeof venueLink>, { now = new Date() }: { now?: Date } = {},
) {
  const { venueLinkToken } = parseInput(venueLink, input);
  return inTransaction(actor, async (tx) => {
    const venueId = await orderVenue(tx, venueLinkToken);
    const shift = await findRunningShift(tx, venueId, now);
    const { rows: tables } = await tx.query<Table>(
      "select id, number from app.tables where venue_id = $1 and active order by number", [venueId],
    );
    return { available: shift !== null && tables.length > 0, tables };
  });
}

export async function sendOrder(
  actor: Actor, input: z.input<typeof sendInput>, { now }: { now?: Date } = {},
): Promise<Order> {
  if (actor.kind !== "guest") throw new MaasiiError("not_allowed", "Send needs an anonymous guest session.");
  const { venueLinkToken, tableId, requestId, lines } = parseInput(sendInput, input);

  return inTransaction(actor, async (tx) => {
    const venueId = await orderVenue(tx, venueLinkToken);
    // Serialize the same request, even if a retry supplies a different Venue Link.
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1::uuid::text, 1))", [requestId]);
    await tx.query("select set_config('app.order_request_id', $1, true)", [requestId]);
    const { rows: [replay] } = await tx.query<Order>(
      `select ${orderFields} from app.orders where guest_user_id = $1 and request_id = $2`,
      [actor.userId, requestId],
    );
    if (replay) return replay;

    await lockVenueShifts(tx, venueId);
    const at = now ?? new Date();
    const shift = await findRunningShift(tx, venueId, at);
    if (!shift) throw new MaasiiError("invalid_input", "Ordering needs a running Shift.", "noRunningShift");
    await tx.query("select set_config('app.order_table_id', $1, true)", [tableId]);
    const { rows: [table] } = await tx.query<Table>(
      "select id, number from app.tables where venue_id = $1 and id = $2 and active",
      [venueId, tableId],
    );
    if (!table) throw new MaasiiError("invalid_input", "Choose an active Table at this Venue.", "orderTableUnavailable");
    const published = (await readPublishedMenu(tx, { venueLinkToken }, at))!;
    const snapshots = lines.map((line): OrderLine => {
      const choices = [...new Set(line.choiceIds)].map((choiceId) => ({ choiceId, name: "" }));
      const priced = priceDraftLine(published.menu, { ...line, dishName: "", choices });
      if (priced.problems.length || priced.unitPriceSantim === null) {
        throw new MaasiiError("invalid_input", "The Draft needs attention.", "orderDraftChanged");
      }
      const dish = published.dishes.find((dish) => dish.id === line.dishId)!;
      return {
        dishId: line.dishId, name: { en: dish.name_en, am: dish.name_am },
        unitPriceSantim: priced.unitPriceSantim, quantity: line.quantity, note: line.note,
        choices: choices.map(({ choiceId }) => {
          const choice = published.choices.find(({ id }) => id === choiceId)!;
          return { id: choiceId, name: { en: choice.name_en, am: choice.name_am }, priceChangeSantim: choice.price_change_santim };
        }),
      };
    });
    const waiter = await findResponsibleWaiter(tx, venueId, tableId, at);
    const { rows: [open] } = await tx.query<{ id: string }>(
      "select id from app.visits where venue_id = $1 and table_id = $2 and closed_at is null", [venueId, tableId],
    );
    const visitId = open?.id ?? (await tx.query<{ id: string }>(
      "insert into app.visits (venue_id, table_id, opened_at) values ($1, $2, $3) returning id", [venueId, tableId, at],
    )).rows[0].id;
    try {
      await tx.query(
        `insert into app.guest_table_choices (venue_id, visit_id) values ($1, $2)
         on conflict (guest_user_id, venue_id) do update set visit_id = excluded.visit_id`,
        [venueId, visitId],
      );
      const { rows: [order] } = await tx.query<Order>(
        `insert into app.orders (
           visit_id, venue_id, table_id, table_number, shift_id, request_id, sent_at, waiter_id, waiter_name, lines
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${orderFields}`,
        [visitId, venueId, tableId, table.number, shift.id, requestId, at, waiter?.waiterId, waiter?.waiterName, JSON.stringify(snapshots)],
      );
      return order;
    } catch (error) {
      if ((error as { constraint?: string }).constraint === "orders_request_id_key") {
        throw new MaasiiError("not_allowed", "This request belongs to another guest session.", "orderRequestConflict");
      }
      throw error;
    }
  });
}

export async function getGuestVisit(actor: Actor, input: z.input<typeof venueLink>): Promise<GuestVisit | null> {
  if (actor.kind !== "guest") return null;
  const { venueLinkToken } = parseInput(venueLink, input);
  return inTransaction(actor, async (tx) => {
    const { rows: orders } = await tx.query<GuestOrder>(
      `select ${orderDetails}, case when guest_user_id = $2 then request_id end as "requestId"
       from app.orders where venue_id = (select id from app.venues where link_token = $1)
         and visit_id in (select visit_id from app.guest_table_choices where guest_user_id = $2)
         and visit_id in (select id from app.visits where closed_at is null)
       order by sent_at, id`,
      [venueLinkToken, actor.userId],
    );
    const latest = orders.at(-1);
    if (!latest) return null;
    const totalSantim = orders.reduce((total, order) => {
      if (order.state !== "accepted") return total;
      return order.lines.reduce((subtotal, line) =>
        line.dropReason == null ? subtotal + line.unitPriceSantim * line.quantity : subtotal, total);
    }, 0);
    return {
      id: latest.visitId, table: { id: latest.tableId, number: latest.tableNumber }, orders, totalSantim,
    };
  });
}

export async function getGuestOrders(actor: Actor, input: z.input<typeof venueLink>): Promise<Order[]> {
  const visit = await getGuestVisit(actor, input);
  return visit?.orders.filter((order): order is Order => order.requestId !== null) ?? [];
}

type OrderWaiter = { id: string; name: string; venueId: string; topic: string };

async function requireOrderWaiter(tx: Tx, actor: Actor, unlockToken: string | undefined, at: Date): Promise<OrderWaiter> {
  if (actor.kind === "staff" && actor.sessionId && unlockToken) {
    await tx.query(
      "select set_config('app.order_unlock_hash', $1, true), set_config('app.order_now', $2, true)",
      [tokenHash(unlockToken), at.toISOString()],
    );
    const { rows: [waiter] } = await tx.query<OrderWaiter>('select id, name, venue_id as "venueId", topic from app.order_waiter()');
    if (waiter) return waiter;
  }
  throw new MaasiiError("not_allowed", "Unlock this Waiter device with its PIN.");
}

export async function getMyTableOrders(
  actor: Actor, { unlockToken }: { unlockToken?: string } = {}, { now = new Date() }: { now?: Date } = {},
): Promise<{ orders: Order[]; topic: string }> {
  return inTransaction(actor, async (tx) => {
    const waiter = await requireOrderWaiter(tx, actor, unlockToken, now);
    const { rows } = await tx.query<Order>(
      `select ${orderFields} from app.orders where venue_id = $1
        and visit_id in (select id from app.visits where closed_at is null) order by (state <> 'sent'), sent_at, id`,
      [waiter.venueId],
    );
    return { orders: rows, topic: waiter.topic };
  });
}

export async function acceptOrder(
  actor: Actor, input: { orderId: string; unlockToken?: string }, { now }: { now?: Date } = {},
): Promise<Order> {
  const { orderId, unlockToken } = parseInput(z.object({ orderId: id, unlockToken: z.string().optional() }), input);
  return inTransaction(actor, async (tx) => {
    const waiter = await requireOrderWaiter(tx, actor, unlockToken, now ?? new Date());
    await lockVenueShifts(tx, waiter.venueId);
    const at = now ?? new Date();
    await tx.query("select set_config('app.order_now', $1, true)", [at.toISOString()]);
    const { rows: [accepted] } = await tx.query<Order>(
      `update app.orders set state = 'accepted', accepted_by = $3, accepted_by_name = $4, accepted_at = $5
       where venue_id = $1 and id = $2 and state = 'sent'
         and visit_id in (select id from app.visits where closed_at is null) returning ${orderFields}`,
      [waiter.venueId, orderId, waiter.id, waiter.name, at],
    );
    if (accepted) return accepted;
    const { rows: [prior] } = await tx.query<Order>(
      `select ${orderFields} from app.orders where venue_id = $1 and id = $2 and state = 'accepted'`,
      [waiter.venueId, orderId],
    );
    if (prior) return prior;
    throw new MaasiiError("not_found", "That Order is outside your assigned Tables.");
  });
}
