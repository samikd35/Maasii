import { z } from "zod";
import type { Actor } from "./actor";
import type { Table } from "./brands";
import { billFromOrders, billVisitFields, readGuestBillOptions, readPreparedBills, type Bill, type BillVisit } from "./bills";
import { inTransaction, type Tx } from "./db";
import { MAX_NOTE_LENGTH, MAX_QUANTITY, priceDraftLine } from "./draft";
import { MaasiiError } from "./errors";
import type { Bilingual } from "./language";
import { readPublishedMenu } from "./menu";
import { readVenuePaymentOptions } from "./payment-options";
import { findResponsibleWaiter, findRunningShift, lockVenueShifts } from "./shifts";
import { parseInput } from "./validation";
import { requireOrderWaiter } from "./waiters";

const id = z.uuid().transform((value) => value.toLowerCase());
const decisionTarget = z.object({ orderId: id, unlockToken: z.string().optional() });
const acceptInput = decisionTarget.extend({
  soldOutLineIndices: z.array(z.number().int().min(0).max(99)).max(100).default([]),
});
const undoInput = decisionTarget.extend({ decisionId: id });
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
  state: "sent" | "accepted" | "declined";
  partyPending: boolean;
  sentAt: Date;
  escalatedAt: Date | null;
  waiterId: string | null;
  waiterName: string | null;
  acceptedByName: string | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  lines: OrderLine[];
};

type OrderDecision = Order & { decisionId: string; undoUntil: Date };

type GuestOrder = Omit<Order, "requestId"> & { requestId: string | null };
type GuestVisit = {
  id: string;
  table: Table;
  orders: GuestOrder[];
  totalSantim: number;
  bill: Bill | null;
  closedAt: Date | null;
  paymentOptions: Awaited<ReturnType<typeof readGuestBillOptions>>;
};

const orderDetails = `id, visit_id as "visitId", table_id as "tableId", table_number as "tableNumber",
  state, party_pending as "partyPending", sent_at as "sentAt", escalated_at as "escalatedAt",
  waiter_id as "waiterId", waiter_name as "waiterName",
  accepted_by_name as "acceptedByName", accepted_at as "acceptedAt", declined_at as "declinedAt", lines`;
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
    const { rows: [open] } = await tx.query<{ id: string; prepared: boolean }>(
      "select id, bill_prepared_at is not null as prepared from app.visits where venue_id = $1 and table_id = $2 and closed_at is null", [venueId, tableId],
    );
    const visitId = open?.id ?? (await tx.query<{ id: string }>(
      "insert into app.visits (venue_id, table_id, opened_at) values ($1, $2, $3) returning id", [venueId, tableId, at],
    )).rows[0].id;
    try {
      if (!open?.prepared) await tx.query(
        `insert into app.guest_table_choices (venue_id, visit_id) values ($1, $2)
         on conflict (guest_user_id, venue_id) do update set visit_id = excluded.visit_id`,
        [venueId, visitId],
      );
      const { rows: [order] } = await tx.query<Order>(
        `insert into app.orders (
           visit_id, venue_id, table_id, table_number, shift_id, request_id, sent_at, waiter_id, waiter_name, lines, party_pending
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning ${orderFields}`,
        [visitId, venueId, tableId, table.number, shift.id, requestId, at, waiter?.waiterId, waiter?.waiterName, JSON.stringify(snapshots), open?.prepared ?? false],
      );
      return order;
    } catch (error) {
      if ((error as { constraint?: string }).constraint === "orders_request_id_key") {
        throw new MaasiiError("not_allowed", "This request belongs to another guest session.", "orderRequestConflict");
      }
      throwPreparedBillError(error);
    }
  });
}

export async function getGuestVisit(actor: Actor, input: z.input<typeof venueLink>): Promise<GuestVisit | null> {
  if (actor.kind !== "guest") return null;
  const { venueLinkToken } = parseInput(venueLink, input);
  return inTransaction(actor, async (tx) => {
    const { rows: [visit] } = await tx.query<BillVisit>(
      `select ${billVisitFields} from app.visits where venue_id = (select id from app.venues where link_token = $1)
         and id in (select visit_id from app.guest_table_choices where guest_user_id = $2)
         and (closed_at is null or closed_reason in ('paid', 'all_declined'))`,
      [venueLinkToken, actor.userId],
    );
    if (!visit) return null;
    const { rows: orders } = await tx.query<GuestOrder>(
      `select ${orderDetails}, case when guest_user_id = $2 then request_id end as "requestId"
       from app.orders where visit_id = $1 and not party_pending order by sent_at, id`,
      [visit.id, actor.userId],
    );
    const latest = orders.at(-1);
    if (!latest) return null;
    const bill = visit.preparedAt && {
      lines: visit.lines ?? [], totalSantim: Number(visit.totalSantim), preparedAt: visit.preparedAt,
    };
    return {
      id: visit.id, table: { id: latest.tableId, number: latest.tableNumber }, orders,
      closedAt: visit.closedAt, bill,
      totalSantim: bill?.totalSantim ?? billFromOrders(orders).totalSantim,
      paymentOptions: bill && !visit.closedAt ? await readGuestBillOptions(tx, visit.venueId) : [],
    };
  });
}

export async function getGuestPendingOrders(actor: Actor, input: z.input<typeof venueLink>): Promise<Order[]> {
  if (actor.kind !== "guest") return [];
  const { venueLinkToken } = parseInput(venueLink, input);
  return inTransaction(actor, async (tx) => {
    const { rows } = await tx.query<Order>(
      `select ${orderFields} from app.orders where guest_user_id = $1 and party_pending
       and venue_id = (select id from app.venues where link_token = $2) order by sent_at, id`,
      [actor.userId, venueLinkToken],
    );
    return rows;
  });
}

export async function getGuestOrders(actor: Actor, input: z.input<typeof venueLink>): Promise<Order[]> {
  const visit = await getGuestVisit(actor, input);
  return visit?.orders.filter((order): order is Order => order.requestId !== null) ?? [];
}

function throwPreparedBillError(error: unknown): never {
  if ((error as { constraint?: string }).constraint === "visit_bill_prepared") {
    throw new MaasiiError("invalid_input", "The Bill is prepared. Ask your waiter to reopen it.", "billPrepared");
  }
  if ((error as { constraint?: string }).constraint === "visit_bill_needs_waiter") {
    throw new MaasiiError("invalid_input", "Ask your waiter before ordering at this table.", "orderTableBillPrepared");
  }
  throw error;
}

export async function getMyTableOrders(
  actor: Actor, { unlockToken, tableId }: { unlockToken?: string; tableId?: string } = {},
  { now = new Date() }: { now?: Date } = {},
) {
  const table = parseInput(id.optional(), tableId);
  return inTransaction(actor, async (tx) => {
    const waiter = await requireOrderWaiter(tx, actor, unlockToken, now);
    const { rows } = await tx.query<Order & { servesTable: boolean }>(
      `select ${orderFields}, app.waiter_serves_order_table(venue_id, table_id) as "servesTable"
       from app.orders where venue_id = $1 and state <> 'declined' and ($2::uuid is null or table_id = $2)
        and app.waiter_order_visit_is_open(visit_id) order by (state <> 'sent'), sent_at, id`,
      [waiter.venueId, table ?? null],
    );
    let tableNumber: number | undefined;
    if (table) {
      tableNumber = rows[0]?.tableNumber ?? (await tx.query<{ number: number }>(
        "select number from app.tables where id = $1 and venue_id = $2 and app.waiter_serves_order_table(venue_id, id)",
        [table, waiter.venueId],
      )).rows[0]?.number;
      if (tableNumber === undefined) throw new MaasiiError("not_found", "That Table is outside your My tables list.");
    }
    const billVisitIds = new Set<string>();
    const orders = rows.map(({ servesTable, ...order }) => {
      if (servesTable) billVisitIds.add(order.visitId);
      return order;
    });
    const bills = await readPreparedBills(tx, waiter.venueId, table);
    const paymentOptions = bills.length
      ? (await readVenuePaymentOptions(tx, waiter.venueId, { activeOnly: true }))
        .map(({ id, kind, provider, accountOrMerchantCode }) => ({ id, kind, provider, accountOrMerchantCode }))
      : [];
    return { orders, topic: waiter.topic, venueId: waiter.venueId, tableNumber, billVisitIds: [...billVisitIds], bills, paymentOptions };
  });
}

export async function acceptOrder(
  actor: Actor, input: z.input<typeof acceptInput>, { now }: { now?: Date } = {},
): Promise<OrderDecision> {
  return decideOrder(actor, parseInput(acceptInput, input), "accepted", now);
}

export async function declineOrder(
  actor: Actor, input: z.input<typeof decisionTarget>, { now }: { now?: Date } = {},
): Promise<OrderDecision> {
  return decideOrder(actor, parseInput(decisionTarget, input), "declined", now);
}

async function lockOrderDecision(tx: Tx, actor: Actor, unlockToken: string | undefined, now: Date | undefined) {
  const waiter = await requireOrderWaiter(tx, actor, unlockToken, now ?? new Date());
  await lockVenueShifts(tx, waiter.venueId);
  const at = now ?? new Date();
  await tx.query("select set_config('app.order_now', $1, true)", [at.toISOString()]);
  return { waiter, at };
}

async function decideOrder(
  actor: Actor,
  { orderId, unlockToken, soldOutLineIndices = [] }: z.input<typeof acceptInput>,
  state: "accepted" | "declined",
  now: Date | undefined,
) {
  return inTransaction(actor, async (tx) => {
    const { waiter, at } = await lockOrderDecision(tx, actor, unlockToken, now);
    const { rows: [prior] } = await tx.query<Order>(
      `select ${orderFields} from app.orders where venue_id = $1 and id = $2`,
      [waiter.venueId, orderId],
    );
    const alreadyDecided = prior ? prior.state !== "sent" : (await tx.query<{ decided: boolean }>(
      "select app.waiter_order_already_decided($1, $2) as decided", [waiter.venueId, orderId],
    )).rows[0].decided;
    if (alreadyDecided) {
      throw new MaasiiError("invalid_input", "Another decision has already been made for this Order.", "orderAlreadyDecided");
    }
    if (!prior) throw new MaasiiError("not_found", "That Order is outside your My tables list.");
    if (prior.partyPending) throw new MaasiiError("invalid_input", "Resolve the new party before acting on its Order.", "orderTableBillPrepared");
    const drops = new Set(soldOutLineIndices);
    if (soldOutLineIndices.some((index) => index >= prior.lines.length)) {
      throw new MaasiiError("invalid_input", "Choose lines from this Order.");
    }
    if (drops.size === prior.lines.length) {
      throw new MaasiiError("invalid_input", "Accept at least one dish or decline the Order.", "orderAllLinesDropped");
    }
    const lines = prior.lines.map((line, index) => drops.has(index) ? { ...line, dropReason: "sold_out" } : line);
    const { rows: [decided] } = await tx.query<OrderDecision>(
      `update app.orders set state = $3,
         accepted_by = case when $3 = 'accepted' then $4::uuid end,
         accepted_by_name = case when $3 = 'accepted' then $5::text end,
         accepted_at = case when $3 = 'accepted' then $6::timestamptz end,
         declined_by = case when $3 = 'declined' then $4::uuid end,
         declined_at = case when $3 = 'declined' then $6::timestamptz end,
         lines = $7, decision_id = gen_random_uuid()
       where venue_id = $1 and id = $2 and state = 'sent'
         and app.waiter_order_visit_is_open(visit_id)
       returning ${orderFields}, decision_id as "decisionId",
         app.order_undo_until(coalesce(accepted_at, declined_at)) as "undoUntil"`,
      [waiter.venueId, orderId, state, waiter.id, waiter.name, at, JSON.stringify(lines)],
    ).catch(throwPreparedBillError);
    if (decided) return decided;
    throw new MaasiiError("not_found", "That Order is outside your assigned Tables.");
  });
}

/** The database scheduler uses the same command with its current time. */
export async function escalateOrders(
  actor: Actor, { now = new Date(), venueId }: { now?: Date; venueId?: string } = {},
): Promise<void> {
  if (actor.kind !== "system") throw new MaasiiError("not_allowed", "Only the notification job escalates Orders.");
  const venue = parseInput(id.optional(), venueId);
  await inTransaction(actor, async (tx) => {
    await tx.query("select app.escalate_orders($1, $2)", [now, venue ?? null]);
  });
}

export async function undoOrderDecision(
  actor: Actor, input: z.input<typeof undoInput>, { now }: { now?: Date } = {},
): Promise<Order> {
  const { orderId, decisionId, unlockToken } = parseInput(undoInput, input);
  return inTransaction(actor, async (tx) => {
    const { waiter, at } = await lockOrderDecision(tx, actor, unlockToken, now);
    const { rows: [decision] } = await tx.query<{ id: string | null; waiterId: string | null; canUndo: boolean | null }>(
      `select decision_id as id, coalesce(accepted_by, declined_by) as "waiterId",
         coalesce(accepted_at, declined_at) <= $3 and $3 < app.order_undo_until(coalesce(accepted_at, declined_at)) as "canUndo"
       from app.orders where venue_id = $1 and id = $2`,
      [waiter.venueId, orderId, at],
    );
    if (!decision) throw new MaasiiError("not_found", "That Order is outside your assigned Tables.");
    if (decision.id !== decisionId) {
      throw new MaasiiError("invalid_input", "This Order has changed.", "orderAlreadyDecided");
    }
    if (decision.waiterId !== waiter.id) {
      throw new MaasiiError("invalid_input", "Only the Waiter who made the decision can undo it.", "orderUndoNotYours");
    }
    if (!decision.canUndo) {
      throw new MaasiiError("invalid_input", "The time to undo this decision has ended.", "orderUndoExpired");
    }
    const { rows: [restored] } = await tx.query<Order>(
      `update app.orders set state = 'sent', accepted_by = null, accepted_by_name = null, accepted_at = null,
         declined_by = null, declined_at = null, decision_id = null,
         lines = (select jsonb_agg(line - 'dropReason' order by n)
           from jsonb_array_elements(lines) with ordinality as l(line, n))
       where venue_id = $1 and id = $2 and decision_id = $3 returning ${orderFields}`,
      [waiter.venueId, orderId, decisionId],
    ).catch((error: unknown) => {
      const constraint = (error as { constraint?: string }).constraint;
      if (constraint === "undo_table_occupied") {
        throw new MaasiiError("invalid_input", "A new party has already ordered at this Table.", "orderTableOccupied");
      }
      if (constraint === "undo_visit_closed") {
        throw new MaasiiError("invalid_input", "This Visit is closed.", "orderVisitClosed");
      }
      throwPreparedBillError(error);
    });
    if (!restored) throw new MaasiiError("not_found", "That Order is outside your assigned Tables.");
    return restored;
  });
}
