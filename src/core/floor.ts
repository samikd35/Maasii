import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { billFromOrders, preparedBillFollowupMinutes, type BillVisit } from "./bills";
import { inTransaction } from "./db";
import type { Order } from "./orders";
import { findRunningShift } from "./shifts";
import { parseInput } from "./validation";

type FloorException = {
  kind: "sent" | "prepared" | "unassigned" | "difference";
  tableNumber: number;
  id: string;
  minutes: number;
};

type TableRow = Pick<BillVisit, "preparedAt" | "totalSantim" | "removedLines" | "discountSantim"> & {
  id: string;
  number: number;
  active: boolean;
  waiter: string | null;
  waiterId: string | null;
  visitId: string | null;
  unassignedSince: Date | null;
};
type FloorOrder = Pick<Order, "id" | "state" | "visitId" | "lines" | "sentAt" | "partyPending">;
const venueInput = z.object({ venueId: z.uuid() });

export async function getLiveFloor(actor: Actor, input: { venueId: string }, { now = new Date() } = {}) {
  const { venueId } = parseInput(venueInput, input);
  const age = (since: Date) => Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const shift = await findRunningShift(tx, venueId, now);
    const { rows } = await tx.query<TableRow>(
      `select t.id, t.number, t.active, assigned.name as waiter, assigned.id as "waiterId", v.id as "visitId",
        v.bill_prepared_at as "preparedAt", v.bill_total_santim as "totalSantim",
        v.bill_removed_lines as "removedLines", v.bill_discount_santim as "discountSantim",
        greatest(v.opened_at, s.started_at, (
          select max(a.ended_at) from app.table_assignments a
          where a.venue_id = t.venue_id and a.table_id = t.id and a.ended_at <= $2
        )) as "unassignedSince"
      from app.tables t
      left join app.visits v on v.table_id = t.id and v.closed_at is null
      left join app.shifts s on s.venue_id = t.venue_id and s.ended_at is null and s.started_at <= $2
      left join lateral (
        select m.id, m.name from app.table_assignments a join app.memberships m on m.id = a.waiter_id and m.active
        where a.venue_id = t.venue_id and a.table_id = t.id and a.started_at <= $2
          and (a.ended_at is null or a.ended_at > $2)
        order by a.started_at desc limit 1
      ) assigned on true
      where t.venue_id = $1 and (v.id is not null or t.active)
      order by t.number`, [venueId, now],
    );
    const visitIds = rows.flatMap((row) => row.visitId ? [row.visitId] : []);
    const { rows: orders } = await tx.query<FloorOrder>(
      `select id, state, visit_id as "visitId", lines, sent_at as "sentAt", party_pending as "partyPending"
       from app.orders where visit_id = any($1::uuid[]) and state in ('sent', 'accepted') order by sent_at, id`, [visitIds],
    );
    const { rows: differences } = await tx.query<{ id: string; tableNumber: number; at: Date }>(
      `select p.visit_id as id, t.number as "tableNumber", p.confirmed_at as at
       from app.payment_confirmations p join app.visits v on v.id = p.visit_id join app.tables t on t.id = v.table_id
       where p.venue_id = $1 and p.difference_santim <> 0
         and p.confirmed_at >= (date_trunc('day', $2::timestamptz at time zone 'Africa/Addis_Ababa') at time zone 'Africa/Addis_Ababa')
         and p.confirmed_at <= $2
       order by p.confirmed_at, p.visit_id`, [venueId, now],
    );
    const exceptions: FloorException[] = [];
    const byVisit = Map.groupBy(orders, (order) => order.visitId);
    const tables = rows.flatMap((row) => {
      if (!row.waiterId && row.unassignedSince && (shift || row.visitId)) {
        exceptions.push({ kind: "unassigned", tableNumber: row.number, id: row.id, minutes: age(row.unassignedSince) });
      }
      if (!row.visitId) return [];
      const ownOrders = byVisit.get(row.visitId) ?? [];
      const oldest = ownOrders.find((order) => order.state === "sent");
      const oldestSentMinutes = oldest ? age(oldest.sentAt) : null;
      if (oldestSentMinutes !== null && oldestSentMinutes >= 2) {
        exceptions.push({ kind: "sent", tableNumber: row.number, id: row.visitId, minutes: oldestSentMinutes });
      }
      if (row.preparedAt && age(row.preparedAt) >= preparedBillFollowupMinutes) {
        exceptions.push({ kind: "prepared", tableNumber: row.number, id: row.visitId, minutes: age(row.preparedAt) });
      }
      const status = row.preparedAt ? "prepared" : oldest ? "sent" : "inService";
      const hasAccepted = ownOrders.some(order => order.state === "accepted");
      const totalSantim = row.preparedAt ? Number(row.totalSantim) : billFromOrders(ownOrders, row).totalSantim;
      const pendingOrders = ownOrders.filter(order => order.state === "sent").map(({ id, lines, sentAt, partyPending }) => ({
        id, minutes: age(sentAt), partyPending,
        lines: lines.map(({ name, quantity, note, choices }) => ({ name, quantity, note, choices })),
      }));
      return [{ id: row.id, number: row.number, visitId: row.visitId, waiter: row.waiter, status, totalSantim, hasAccepted, oldestSentMinutes, pendingOrders }] as const;
    });
    exceptions.push(...differences.map((difference) => ({
      kind: "difference" as const, id: difference.id, tableNumber: difference.tableNumber, minutes: age(difference.at),
    })));
    const priority = { sent: 0, prepared: 1, unassigned: 2, difference: 3 };
    exceptions.sort((a, b) => priority[a.kind] - priority[b.kind] || b.minutes - a.minutes || a.tableNumber - b.tableNumber);
    const active = rows.filter(row => row.active);
    return {
      tables, exceptions, updatedAt: now.toISOString(),
      service: {
        shiftStartedAt: shift?.startedAt.toISOString() ?? null,
        active: active.length,
        assigned: shift ? active.filter(table => table.waiterId).length : 0,
        waiters: shift ? new Set(active.flatMap(table => table.waiterId ? [table.waiterId] : [])).size : 0,
      },
      quietTables: active.filter(table => !table.visitId).map(({ id, number, waiter }) => ({ id, number, waiter })),
    };
  });
}
