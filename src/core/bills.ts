import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { inTransaction, lockVenueShifts, type Tx } from "./db";
import { MaasiiError } from "./errors";
import type { Order } from "./orders";
import { readVenuePaymentOptions, type PaymentOption } from "./payment-options";
import { parseInput } from "./validation";
import { requireOrderWaiter } from "./waiters";

const billTarget = z.object({
  venueId: z.uuid().transform((value) => value.toLowerCase()),
  visitId: z.uuid().transform((value) => value.toLowerCase()),
  unlockToken: z.string().optional(),
});

export type Bill = {
  lines: Order["lines"];
  totalSantim: number;
  preparedAt: Date;
};

export type BillVisit = {
  id: string;
  venueId: string;
  tableId: string;
  closedAt: Date | null;
  preparedAt: Date | null;
  lines: Bill["lines"] | null;
  totalSantim: string | null;
  removedLines: string[];
  discountSantim: string;
};

export const billVisitFields = `id, venue_id as "venueId", table_id as "tableId", closed_at as "closedAt",
  bill_prepared_at as "preparedAt", bill_lines as lines, bill_total_santim as "totalSantim",
  bill_removed_lines as "removedLines", bill_discount_santim as "discountSantim"`;

export type PreparedBill = {
  visitId: string;
  tableId: string;
  preparedAt: Date;
  totalSantim: number;
  reminder: boolean;
};

export async function readPreparedBills(tx: Tx, venueId: string, tableId?: string): Promise<PreparedBill[]> {
  const { rows } = await tx.query<Omit<PreparedBill, "totalSantim"> & { totalSantim: string }>(
    `select id as "visitId", table_id as "tableId", bill_prepared_at as "preparedAt", bill_total_santim as "totalSantim",
       bill_reminded_at is not null as reminder
     from app.visits where venue_id = $1 and closed_at is null and bill_prepared_at is not null
       and ($2::uuid is null or table_id = $2) order by bill_prepared_at, id`,
    [venueId, tableId],
  );
  return rows.map((row) => ({ ...row, totalSantim: Number(row.totalSantim) }));
}

export async function getPreparedBills(actor: Actor, input: { venueId: string }): Promise<PreparedBill[]> {
  const { venueId } = parseInput(billTarget.pick({ venueId: true }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    return readPreparedBills(tx, venueId);
  });
}

export function billFromOrders(
  orders: Pick<Order, "id" | "state" | "lines">[], adjustments?: Pick<BillVisit, "removedLines" | "discountSantim">,
) {
  const removed = new Set(adjustments?.removedLines);
  const lines = orders.flatMap((order) => order.state === "accepted"
    ? order.lines.flatMap((line, lineIndex) => line.dropReason != null || removed.has(`${order.id}:${lineIndex}`)
      ? [] : [{ ...line, orderId: order.id, lineIndex }]) : []);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPriceSantim * line.quantity, 0);
  const discountSantim = Math.min(subtotal, Number(adjustments?.discountSantim ?? 0));
  return { lines, totalSantim: subtotal - discountSantim, discountSantim };
}

async function readBillOrders(tx: Tx, visitIds: string[]) {
  const { rows } = await tx.query<Pick<Order, "id" | "state" | "lines" | "visitId">>(
    `select id, state, lines, visit_id as "visitId" from app.orders
     where visit_id = any($1::uuid[]) and state = 'accepted' order by sent_at, id`, [visitIds],
  );
  return rows;
}

export async function readGuestBillOptions(tx: Tx, venueId: string) {
  const options = await readVenuePaymentOptions(tx, venueId, { activeOnly: true });
  return options.map(({ id, kind, provider, recipientName, accountOrMerchantCode, qrImage }) =>
    ({ id, kind, provider, recipientName, accountOrMerchantCode, qrImage }));
}

async function authorizedBill(
  tx: Tx, actor: Actor, { venueId, visitId, unlockToken }: z.output<typeof billTarget>, now: Date | undefined,
) {
  if (actor.kind !== "staff") throw new MaasiiError("not_allowed", "Only authorized staff can change a Bill.");
  await lockVenueShifts(tx, venueId);
  const at = now ?? new Date();
  if (unlockToken) await requireOrderWaiter(tx, actor, unlockToken, at);
  const { rows: [visit] } = await tx.query<BillVisit>(
    `select ${billVisitFields} from app.visits where venue_id = $1 and id = $2
       and (app.can_manage_venue(venue_id) or app.waiter_serves_order_table(venue_id, table_id))`,
    [venueId, visitId],
  );
  if (!visit) throw new MaasiiError("not_allowed", "This Visit is outside your assigned Tables or Venue.");
  await tx.query("select set_config('app.bill_changed_at', $1, true)", [at.toISOString()]);
  return { ...visit, at };
}

export async function prepareBill(actor: Actor, input: z.input<typeof billTarget>, { now }: { now?: Date } = {}) {
  const target = parseInput(billTarget, input);
  return inTransaction(actor, async (tx) => {
    const visit = await authorizedBill(tx, actor, target, now);
    if (visit.closedAt) throw new MaasiiError("invalid_input", "The Visit is closed.");
    if (visit.preparedAt) return;
    const rows = await readBillOrders(tx, [visit.id]);
    const { lines, totalSantim } = billFromOrders(rows, visit);
    if (!rows.length) throw new MaasiiError("invalid_input", "The Bill needs an Accepted Order.");
    if (!Number.isSafeInteger(totalSantim)) throw new MaasiiError("invalid_input", "The Bill total is too large.");
    await tx.query(
      "update app.visits set bill_prepared_at = $2, bill_lines = $3, bill_total_santim = $4 where id = $1",
      [visit.id, visit.at, JSON.stringify(lines), totalSantim],
    );
  });
}

export async function reopenBill(actor: Actor, input: z.input<typeof billTarget>, { now }: { now?: Date } = {}) {
  const target = parseInput(billTarget, input);
  return inTransaction(actor, async (tx) => {
    const visit = await authorizedBill(tx, actor, target, now);
    if (visit.closedAt) throw new MaasiiError("invalid_input", "The Visit is closed.");
    if (!visit.preparedAt) return;
    await tx.query(
      "update app.visits set bill_prepared_at = null, bill_lines = null, bill_total_santim = null where id = $1",
      [visit.id],
    );
    await tx.query("select app.resolve_pending_party($1, $2)", [visit.id, visit.at]);
  });
}

const confirmationInput = billTarget.extend({
  paymentOptionId: z.uuid().transform((value) => value.toLowerCase()).nullable(),
  receiptAmountSantim: z.number().int().nonnegative(),
});

export type PaymentConfirmation = {
  visitId: string;
  method: Pick<PaymentOption, "kind" | "provider" | "recipientName" | "accountOrMerchantCode"> & { paymentOptionId: string | null };
  receiptAmountSantim: number;
  billTotalSantim: number;
  differenceSantim: number;
  confirmedBy: string;
  confirmedAt: Date;
};

type ConfirmationRow = Omit<PaymentConfirmation, "receiptAmountSantim" | "billTotalSantim" | "differenceSantim"> & {
  receiptAmountSantim: string;
  billTotalSantim: string;
  differenceSantim: string;
};

const confirmationFields = `visit_id as "visitId", method, receipt_amount_santim as "receiptAmountSantim",
  bill_total_santim as "billTotalSantim", difference_santim as "differenceSantim",
  confirmed_by as "confirmedBy", confirmed_at as "confirmedAt"`;

function paymentConfirmation(row: ConfirmationRow): PaymentConfirmation {
  return {
    ...row,
    receiptAmountSantim: Number(row.receiptAmountSantim),
    billTotalSantim: Number(row.billTotalSantim),
    differenceSantim: Number(row.differenceSantim),
  };
}

export async function confirmPayment(
  actor: Actor, input: z.input<typeof confirmationInput>, { now }: { now?: Date } = {},
): Promise<PaymentConfirmation> {
  const { paymentOptionId, receiptAmountSantim, ...target } = parseInput(confirmationInput, input);
  return inTransaction(actor, async (tx) => {
    const visit = await authorizedBill(tx, actor, target, now);
    if (visit.closedAt) {
      const { rows: [prior] } = await tx.query<ConfirmationRow>(
        `select ${confirmationFields} from app.payment_confirmations where visit_id = $1`, [visit.id],
      );
      if (prior) return paymentConfirmation(prior);
      throw new MaasiiError("invalid_input", "The Visit is closed.");
    }
    if (!visit.preparedAt) throw new MaasiiError("invalid_input", "Prepare the Bill before confirming payment.");

    let method: PaymentConfirmation["method"] = {
      paymentOptionId: null, kind: "cash", provider: null, recipientName: null, accountOrMerchantCode: null,
    };
    if (paymentOptionId) {
      const options = await readVenuePaymentOptions(tx, visit.venueId, { activeOnly: true });
      const option = options.find(({ id }) => id === paymentOptionId);
      if (!option) throw new MaasiiError("invalid_input", "Choose an active Payment Option at this Venue.");
      const { kind, provider, recipientName, accountOrMerchantCode } = option;
      method = { paymentOptionId, kind, provider, recipientName, accountOrMerchantCode };
    }

    const { rows: [row] } = await tx.query<ConfirmationRow>(
      `insert into app.payment_confirmations
        (visit_id, venue_id, method, receipt_amount_santim, bill_total_santim, confirmed_at)
       values ($1, $2, $3, $4, $5, $6) returning ${confirmationFields}`,
      [visit.id, visit.venueId, method, receiptAmountSantim, visit.totalSantim, visit.at],
    );
    const { rowCount } = await tx.query(
      "update app.visits set closed_at = $2, closed_reason = 'paid' where id = $1", [visit.id, visit.at],
    );
    if (!rowCount) throw new MaasiiError("not_allowed", "The Visit is outside your assigned Tables or Venue.");
    await tx.query("select app.resolve_pending_party($1, $2)", [visit.id, visit.at]);
    return paymentConfirmation(row);
  });
}


export async function flagUnconfirmedBills(
  actor: Actor, { now = new Date(), venueId }: { now?: Date; venueId?: string } = {},
): Promise<void> {
  if (actor.kind !== "system") throw new MaasiiError("not_allowed", "Only the notification job flags prepared Bills.");
  const venue = parseInput(z.uuid().optional(), venueId);
  await inTransaction(actor, async (tx) => {
    await tx.query("select app.flag_unconfirmed_bills($1, $2)", [now, venue ?? null]);
  });
}

const adjustmentTarget = billTarget.extend({ reason: z.string().trim().min(1).max(300) });
const adjustmentInput = z.discriminatedUnion("kind", [
  adjustmentTarget.extend({ kind: z.literal("remove_line"), orderId: z.uuid(), lineIndex: z.number().int().nonnegative() }),
  adjustmentTarget.extend({ kind: z.literal("discount"), amountSantim: z.number().int().nonnegative() }),
]);
const unpaidInput = billTarget.extend({ reason: z.enum(["walked_out", "on_the_house", "entered_by_mistake"]) });

export async function adjustVisitBill(actor: Actor, input: z.input<typeof adjustmentInput>, { now }: { now?: Date } = {}) {
  const change = parseInput(adjustmentInput, input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, change.venueId);
    const visit = await authorizedBill(tx, actor, change, now);
    if (visit.closedAt) throw new MaasiiError("invalid_input", "The Visit is closed.");
    const orders = await readBillOrders(tx, [visit.id]);
    const current = billFromOrders(orders, visit);
    if (change.kind === "remove_line") {
      if (!current.lines.some((line) => line.orderId === change.orderId && line.lineIndex === change.lineIndex)) {
        throw new MaasiiError("invalid_input", "This line is no longer on the Bill.");
      }
      visit.removedLines.push(`${change.orderId}:${change.lineIndex}`);
    } else {
      if (change.amountSantim > current.totalSantim + current.discountSantim) {
        throw new MaasiiError("invalid_input", "The discount is larger than the Bill.");
      }
      visit.discountSantim = String(change.amountSantim);
    }
    const revised = billFromOrders(orders, visit);
    await tx.query(
      `update app.visits set bill_removed_lines = $2, bill_discount_santim = $3,
        bill_lines = $4, bill_total_santim = $5 where id = $1`,
      [visit.id, visit.removedLines, visit.discountSantim, visit.preparedAt ? JSON.stringify(revised.lines) : null,
        visit.preparedAt ? revised.totalSantim : null],
    );
    await tx.query(
      `insert into app.bill_adjustments
        (visit_id, venue_id, kind, order_id, line_index, amount_santim, reason, changed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [visit.id, visit.venueId, change.kind, change.kind === "remove_line" ? change.orderId : null,
        change.kind === "remove_line" ? change.lineIndex : null, change.kind === "discount" ? change.amountSantim : null,
        change.reason, visit.at],
    );
  });
}

export async function closeVisitUnpaid(actor: Actor, input: z.input<typeof unpaidInput>, { now }: { now?: Date } = {}) {
  const target = parseInput(unpaidInput, input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, target.venueId);
    const visit = await authorizedBill(tx, actor, target, now);
    if (visit.closedAt) throw new MaasiiError("invalid_input", "The Visit is closed.");
    await tx.query("update app.visits set closed_at = $2, closed_reason = $3 where id = $1", [visit.id, visit.at, target.reason]);
    await tx.query("select app.resolve_pending_party($1, $2)", [visit.id, visit.at]);
  });
}

export async function getClosingReport(actor: Actor, input: { venueId: string; date?: string }, { now = new Date() } = {}) {
  const { venueId, date } = parseInput(billTarget.pick({ venueId: true }).extend({ date: z.iso.date().optional() }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const { rows: [day] } = await tx.query<{ date: string }>(
      "select coalesce($1::date, ($2::timestamptz at time zone 'Africa/Addis_Ababa')::date)::text as date", [date ?? null, now],
    );
    const { rows: open } = await tx.query<BillVisit & { openedAt: Date; tableNumber: number; waiterName: string | null }>(
      `select ${billVisitFields}, opened_at as "openedAt",
        (select number from app.tables where id = visits.table_id) as "tableNumber",
        (select m.name from app.table_assignments a join app.memberships m on m.id = a.waiter_id
          where a.table_id = visits.table_id and a.started_at <= $2 and (a.ended_at is null or a.ended_at > $2)
          order by a.started_at desc limit 1) as "waiterName"
       from app.visits where venue_id = $1 and closed_at is null order by opened_at, id`, [venueId, now],
    );
    const { rows: adjustments } = await tx.query<{
      id: string; visitId: string; kind: "remove_line" | "discount"; reason: string;
      changedBy: string; changedByName: string | null; changedAt: Date; amountSantim: string | null; tableNumber: number;
    }>(
      `select id, visit_id as "visitId", kind, reason, changed_by as "changedBy", changed_at as "changedAt",
          amount_santim as "amountSantim", (select m.name from app.memberships m
            where m.user_id = bill_adjustments.changed_by and m.name is not null
            order by m.active desc, m.id limit 1) as "changedByName",
          (select t.number from app.visits v join app.tables t on t.id = v.table_id where v.id = bill_adjustments.visit_id) as "tableNumber"
       from app.bill_adjustments where venue_id = $1 and (visit_id = any($2::uuid[]) or visit_id in (
         select v.id from app.visits v where v.venue_id = $1
           and v.closed_at >= ($3::date::timestamp at time zone 'Africa/Addis_Ababa')
           and v.closed_at < (($3::date + 1)::timestamp at time zone 'Africa/Addis_Ababa')
       )) order by id`,
      [venueId, open.map(({ id }) => id), day.date],
    );
    const orders = await readBillOrders(tx, open.map(({ id }) => id));
    const visits = open.map((visit) => ({
      id: visit.id, tableId: visit.tableId, preparedAt: visit.preparedAt, tableNumber: visit.tableNumber, waiterName: visit.waiterName,
      minutesOpen: Math.max(0, Math.floor((now.getTime() - visit.openedAt.getTime()) / 60_000)),
      ...billFromOrders(orders.filter(({ visitId }) => visitId === visit.id), visit),
      adjustments: adjustments.filter(({ visitId }) => visitId === visit.id),
    }));
    const { rows } = await tx.query<ConfirmationRow & { tableNumber: number }>(
      `select ${confirmationFields},
         (select t.number from app.visits v join app.tables t on t.id = v.table_id where v.id = payment_confirmations.visit_id) as "tableNumber"
       from app.payment_confirmations where venue_id = $1
        and confirmed_at >= ($2::date::timestamp at time zone 'Africa/Addis_Ababa')
        and confirmed_at < (($2::date + 1)::timestamp at time zone 'Africa/Addis_Ababa')
       order by confirmed_at, visit_id`, [venueId, day.date],
    );
    const payments = rows.map((row) => ({ ...paymentConfirmation(row), tableNumber: row.tableNumber }));
    const totals = payments.reduce((sum, p) => ({
      receiptSantim: sum.receiptSantim + p.receiptAmountSantim,
      billSantim: sum.billSantim + p.billTotalSantim,
      differenceSantim: sum.differenceSantim + p.differenceSantim,
    }), { receiptSantim: 0, billSantim: 0, differenceSantim: 0 });
    const openIds = new Set(open.map(({ id }) => id));
    const closedAdjustments = adjustments.filter(({ visitId }) => !openIds.has(visitId));
    const methods = open.length ? (await readVenuePaymentOptions(tx, venueId, { activeOnly: true }))
      .map(({ id, kind, provider, accountOrMerchantCode }) => ({ id, kind, provider, accountOrMerchantCode })) : [];
    return { date: day.date, visits, payments, totals, closedAdjustments, methods };
  });
}
