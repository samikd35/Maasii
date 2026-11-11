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
};

export const billVisitFields = `id, venue_id as "venueId", table_id as "tableId", closed_at as "closedAt",
  bill_prepared_at as "preparedAt", bill_lines as lines, bill_total_santim as "totalSantim"`;

export type PreparedBill = {
  visitId: string;
  tableId: string;
  preparedAt: Date;
  totalSantim: number;
};

export async function readPreparedBills(tx: Tx, venueId: string, tableId?: string): Promise<PreparedBill[]> {
  const { rows } = await tx.query<Omit<PreparedBill, "totalSantim"> & { totalSantim: string }>(
    `select id as "visitId", table_id as "tableId", bill_prepared_at as "preparedAt", bill_total_santim as "totalSantim"
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

export function billFromOrders(orders: Pick<Order, "state" | "lines">[]): Omit<Bill, "preparedAt"> {
  const lines = orders.flatMap((order) => order.state === "accepted"
    ? order.lines.filter((line) => line.dropReason == null) : []);
  return { lines, totalSantim: lines.reduce((sum, line) => sum + line.unitPriceSantim * line.quantity, 0) };
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
    const { rows } = await tx.query<Pick<Order, "state" | "lines">>(
      "select state, lines from app.orders where visit_id = $1 and state = 'accepted' order by sent_at, id",
      [visit.id],
    );
    const { lines, totalSantim } = billFromOrders(rows);
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
    return paymentConfirmation(row);
  });
}
