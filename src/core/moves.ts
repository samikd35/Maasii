import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import type { Table } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { orderVenue } from "./orders";
import { parseInput } from "./validation";
import { requireOrderWaiter } from "./waiters";

const id = z.uuid().transform((value) => value.toLowerCase());
const waiterMove = z.object({ tableId: id, unlockToken: z.string().optional() });

async function move(tx: Tx, target: [string | null, string | null, string | null], tableId: string, now: Date) {
  try {
    const { rows } = await tx.query<Table>("select * from app.move_service($1, $2, $3, $4, $5)", [...target, tableId, now]);
    return rows[0];
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    if (code === "42501") throw new MaasiiError("not_allowed", "Only the responsible Waiter can move this Order or Visit.");
    switch (constraint) {
      case "table_choice_locked": throw new MaasiiError("invalid_input", "Ask your Waiter to change your Table.", "tableChoiceLocked");
      case "order_table_occupied": throw new MaasiiError("invalid_input", "That Table has an open Visit.", "orderTableOccupied");
      case "order_table_unavailable": throw new MaasiiError("invalid_input", "Choose an active Table at this Venue.", "orderTableUnavailable");
      case "order_visit_closed": throw new MaasiiError("invalid_input", "This Visit is closed.", "orderVisitClosed");
      case "visit_bill_prepared": throw new MaasiiError("invalid_input", "Reopen the prepared Bill before moving an Order.", "billPrepared");
      default: throw error;
    }
  }
}

export async function moveOrder(
  actor: Actor, input: { orderId: string; tableId: string; unlockToken?: string }, { now = new Date() } = {},
) {
  const { orderId, tableId, unlockToken } = parseInput(waiterMove.extend({ orderId: id }), input);
  return inTransaction(actor, async (tx) => {
    await requireOrderWaiter(tx, actor, unlockToken, now);
    return move(tx, [orderId, null, null], tableId, now);
  });
}

export async function moveVisit(
  actor: Actor, input: { visitId: string; tableId: string; unlockToken?: string }, { now = new Date() } = {},
) {
  const { visitId, tableId, unlockToken } = parseInput(waiterMove.extend({ visitId: id }), input);
  return inTransaction(actor, async (tx) => {
    await requireOrderWaiter(tx, actor, unlockToken, now);
    return move(tx, [null, visitId, null], tableId, now);
  });
}

export async function changeGuestTable(
  actor: Actor, input: { venueLinkToken: string; tableId: string }, { now = new Date() } = {},
) {
  if (actor.kind !== "guest") throw new MaasiiError("not_allowed", "Changing Table Choice needs a guest session.");
  const { venueLinkToken, tableId } = parseInput(z.object({ venueLinkToken: z.string().min(1).max(200), tableId: id }), input);
  return inTransaction(actor, async (tx) => {
    const venueId = await orderVenue(tx, venueLinkToken);
    return move(tx, [null, null, venueId], tableId, now);
  });
}

export async function getMoveHistory(actor: Actor, input: { venueId: string }) {
  const { venueId } = parseInput(z.object({ venueId: id }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const { rows } = await tx.query<{
      orderId: string | null; fromVisitId: string; toVisitId: string; fromTableId: string;
      toTableId: string; changedBy: string; changedAt: Date;
    }>(`select order_id as "orderId", from_visit_id as "fromVisitId", to_visit_id as "toVisitId",
      from_table_id as "fromTableId", to_table_id as "toTableId", changed_by as "changedBy", changed_at as "changedAt"
      from app.visit_moves where venue_id = $1 order by id`, [venueId]);
    return rows;
  });
}
