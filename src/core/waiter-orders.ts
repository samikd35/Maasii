import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { inTransaction, lockVenueShifts, type Tx } from "./db";
import { MAX_QUANTITY } from "./draft";
import { MaasiiError } from "./errors";
import { readPublishedMenu } from "./menu";
import { orderFields, orderLines, snapshotOrderLines, type Order } from "./orders";
import { findRunningShift } from "./shifts";
import { parseInput } from "./validation";
import { requireOrderWaiter } from "./waiters";

const id = z.uuid().transform((value) => value.toLowerCase());
const tableTarget = z.object({ tableId: id, unlockToken: z.string().optional() });
const quickOrder = tableTarget.extend({ requestId: id, lines: orderLines });
const correction = z.object({
  orderId: id,
  lineIndex: z.number().int().min(0).max(99),
  quantity: z.number().int().min(1).max(MAX_QUANTITY).nullable(),
  reason: z.string().trim().min(1).max(300),
  unlockToken: z.string().optional(),
});

async function assignedTable(tx: Tx, venueId: string, tableId: string) {
  const { rows: [table] } = await tx.query<{ id: string; number: number; venueLinkToken: string }>(
    `select t.id, t.number, v.link_token as "venueLinkToken" from app.tables t join app.venues v on v.id = t.venue_id
     where t.id = $1 and t.venue_id = $2 and t.active and app.waiter_serves_order_table(t.venue_id, t.id)`,
    [tableId, venueId],
  );
  if (!table) throw new MaasiiError("not_allowed", "Choose one of your assigned Tables.");
  return table;
}

export async function getWaiterQuickAdd(actor: Actor, input: z.input<typeof tableTarget>, { now = new Date() } = {}) {
  const { tableId, unlockToken } = parseInput(tableTarget, input);
  return inTransaction(actor, async (tx) => {
    const waiter = await requireOrderWaiter(tx, actor, unlockToken, now);
    const table = await assignedTable(tx, waiter.venueId, tableId);
    const [published, { rows }] = await Promise.all([
      readPublishedMenu(tx, table, now),
      tx.query<{ lines: Order["lines"] }>("select app.recent_waiter_order_lines() as lines"),
    ]);
    const dishes = published?.menuSections.flatMap((section) => section.dishes.map(({ dishId, name, optionGroups, priceSantim }) =>
      ({ dishId, name, optionGroups, priceSantim }))) ?? [];
    const recent = [...new Set(rows.flatMap(({ lines }) => lines.filter(({ dropReason }) => !dropReason).map(({ dishId }) => dishId)))].slice(0, 8);
    return { table: { id: table.id, number: table.number }, dishes, recent };
  });
}

export async function addWaiterOrder(actor: Actor, input: z.input<typeof quickOrder>, { now = new Date() } = {}) {
  const { tableId, unlockToken, requestId, lines } = parseInput(quickOrder, input);
  return inTransaction(actor, async (tx) => {
    const waiter = await requireOrderWaiter(tx, actor, unlockToken, now);
    await lockVenueShifts(tx, waiter.venueId);
    const { rows: [prior] } = await tx.query<Order>(
      `select ${orderFields} from app.orders where request_id = $1 and entered_by = $2`, [requestId, waiter.id],
    );
    if (prior) return prior;

    const table = await assignedTable(tx, waiter.venueId, tableId);
    const shift = await findRunningShift(tx, waiter.venueId, now);
    if (!shift) throw new MaasiiError("invalid_input", "Quick-add needs a running Shift.", "noRunningShift");
    const { rows: [open] } = await tx.query<{ id: string; prepared: boolean }>(
      "select id, bill_prepared_at is not null as prepared from app.visits where table_id = $1 and closed_at is null", [tableId],
    );
    if (open?.prepared) throw new MaasiiError("invalid_input", "Reopen the Bill before adding an Order.", "billPrepared");
    const published = await readPublishedMenu(tx, table, now);
    if (!published?.menu.menuVersion) throw new MaasiiError("invalid_input", "This Venue has no published Menu.", "orderDraftChanged");
    const snapshots = snapshotOrderLines(published, lines);
    const visitId = open?.id ?? (await tx.query<{ id: string }>(
      "insert into app.visits (venue_id, table_id, opened_at) values ($1, $2, $3) returning id", [waiter.venueId, tableId, now],
    )).rows[0].id;
    try {
      const { rows: [order] } = await tx.query<Order>(
        `insert into app.orders (
          visit_id, venue_id, table_id, table_number, shift_id, request_id, sent_at, waiter_id, waiter_name,
          lines, guest_user_id, entered_by, state, accepted_by, accepted_by_name, accepted_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, $8, 'accepted', $8, $9, $7)
        returning ${orderFields}`,
        [visitId, waiter.venueId, tableId, table.number, shift.id, requestId, now, waiter.id, waiter.name, JSON.stringify(snapshots)],
      );
      return order;
    } catch (error) {
      if ((error as { constraint?: string }).constraint === "orders_request_id_key") {
        throw new MaasiiError("invalid_input", "This Order request is already in use.", "orderRequestConflict");
      }
      throw error;
    }
  });
}

export async function correctWaiterOrderLine(actor: Actor, input: z.input<typeof correction>, { now = new Date() } = {}) {
  const { orderId, lineIndex, quantity, reason, unlockToken } = parseInput(correction, input);
  return inTransaction(actor, async (tx) => {
    await requireOrderWaiter(tx, actor, unlockToken, now);
    try {
      await tx.query("select app.correct_waiter_order_line($1, $2, $3, $4, $5)", [orderId, lineIndex, quantity, reason, now]);
    } catch (error) {
      const { code, constraint } = error as { code?: string; constraint?: string };
      if (code === "42501") throw new MaasiiError("not_allowed", "Only the assigned Waiter who accepted the Order can correct it.");
      switch (constraint) {
        case "visit_bill_prepared": throw new MaasiiError("invalid_input", "Reopen the Bill before correcting an Order.", "billPrepared");
        case "order_visit_closed": throw new MaasiiError("invalid_input", "This Visit is closed.", "orderVisitClosed");
        case "order_line_unavailable": throw new MaasiiError("invalid_input", "This Order line was already removed or is unavailable.", "orderLineUnavailable");
        default: throw error;
      }
    }
  });
}

export async function getOrderCorrections(actor: Actor, input: { venueId: string; orderId: string }) {
  const { venueId, orderId } = parseInput(z.object({ venueId: id, orderId: id }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const { rows } = await tx.query<{
      lineIndex: number; beforeQuantity: number; afterQuantity: number | null; reason: string; changedBy: string; changedAt: Date;
    }>(`select line_index as "lineIndex", before_quantity as "beforeQuantity", after_quantity as "afterQuantity",
        reason, changed_by as "changedBy", changed_at as "changedAt"
       from app.waiter_order_corrections where venue_id = $1 and order_id = $2 order by id`, [venueId, orderId]);
    return rows;
  });
}
