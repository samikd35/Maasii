import { z } from "zod";
import { requireBrandOwner, requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { findVenue } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { parseInput } from "./validation";

export const paymentOptionKinds = ["bank_transfer", "mobile_wallet", "cash"] as const;
export const paymentQrMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_PAYMENT_QR_BYTES = 256 * 1024;

function nullableText(max: number) {
  return z.string().trim().max(max).refine((value) => !value.includes("\0")).transform((value) => value || null).nullable();
}

// ponytail: small inline QR images keep audit snapshots atomic. Use immutable Storage objects if history grows large.
const qrImage = z.string().max(Math.ceil(MAX_PAYMENT_QR_BYTES / 3) * 4 + 32).refine((value) => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_PAYMENT_QR_BYTES || bytes.toString("base64") !== match[2]) return false;
  switch (match[1]) {
    case "image/png": return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    case "image/jpeg": return bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
    case "image/webp": return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    default: return false;
  }
}).nullable();

const details = z.object({
  kind: z.enum(paymentOptionKinds),
  provider: nullableText(120),
  recipientName: nullableText(160),
  accountOrMerchantCode: nullableText(100),
  qrImage,
  displayOrder: z.number().int().min(1).max(2_147_483_647),
});
const venueInput = z.object({ venueId: z.uuid() });
const addInput = venueInput.extend({
  ...details.shape,
  provider: details.shape.provider.default(null),
  recipientName: details.shape.recipientName.default(null),
  accountOrMerchantCode: details.shape.accountOrMerchantCode.default(null),
  qrImage: qrImage.default(null),
});

export type PaymentOptionKind = (typeof paymentOptionKinds)[number];
export type PaymentOption = z.output<typeof details> & {
  id: string;
  venueId: string;
  active: boolean;
  revision: string;
};

type PaymentOptionRow = {
  id: string;
  venue_id: string;
  kind: PaymentOptionKind;
  provider: string | null;
  recipient_name: string | null;
  account_or_merchant_code: string | null;
  qr_image: string | null;
  display_order: number;
  active: boolean;
  revision: string;
};

function toPaymentOption(row: PaymentOptionRow): PaymentOption {
  return {
    id: row.id,
    venueId: row.venue_id,
    kind: row.kind,
    provider: row.provider,
    recipientName: row.recipient_name,
    accountOrMerchantCode: row.account_or_merchant_code,
    qrImage: row.qr_image,
    displayOrder: row.display_order,
    active: row.active,
    revision: row.revision,
  };
}

function requirePaymentDestination(option: z.output<typeof details>) {
  if (option.kind !== "cash" && (!option.provider || !option.recipientName || !option.accountOrMerchantCode)) {
    throw new MaasiiError(
      "invalid_input",
      "Enter the provider, recipient name and account number or merchant code.",
      "paymentDestinationRequired",
    );
  }
}

/** A Venue's Payment Options, including inactive options, in display order. */
export async function listPaymentOptions(actor: Actor, input: z.input<typeof venueInput>): Promise<PaymentOption[]> {
  const { venueId } = parseInput(venueInput, input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    return readVenuePaymentOptions(tx, venueId);
  });
}

export async function readVenuePaymentOptions(tx: Tx, venueId: string): Promise<PaymentOption[]> {
  const { rows } = await tx.query<PaymentOptionRow>(
    `select * from app.payment_options where venue_id = $1 order by display_order, id`,
    [venueId],
  );
  return rows.map(toPaymentOption);
}

export async function addPaymentOption(
  actor: Actor,
  input: z.input<typeof addInput>,
  { now = new Date() }: { now?: Date } = {},
): Promise<PaymentOption> {
  const option = parseInput(addInput, input);
  requirePaymentDestination(option);
  return inTransaction(actor, async (tx) => {
    const venue = await findVenue(tx, option.venueId);
    await requireBrandOwner(tx, actor, venue.brandId);
    await setPaymentChangeTime(tx, now);
    const { rows } = await tx.query<PaymentOptionRow>(
      `insert into app.payment_options
         (venue_id, kind, provider, recipient_name, account_or_merchant_code, qr_image, display_order)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [option.venueId, option.kind, option.provider, option.recipientName, option.accountOrMerchantCode,
        option.qrImage, option.displayOrder],
    );
    return toPaymentOption(rows[0]);
  });
}

async function setPaymentChangeTime(tx: Tx, now: Date) {
  await tx.query("select set_config('app.payment_option_changed_at', $1, true)", [now.toISOString()]);
}

export type PaymentOptionChange = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  changedAt: Date;
  before: PaymentOption | null;
  after: PaymentOption | null;
};

type PaymentOptionChangeRow = Omit<PaymentOptionChange, "before" | "after"> & {
  before: PaymentOptionRow | null;
  after: PaymentOptionRow | null;
};

/** The Owner's audit history for a Venue, newest changes first. */
export async function listPaymentOptionChanges(
  actor: Actor,
  input: z.input<typeof venueInput>,
): Promise<PaymentOptionChange[]> {
  const { venueId } = parseInput(venueInput, input);
  return inTransaction(actor, async (tx) => {
    const venue = await findVenue(tx, venueId);
    await requireBrandOwner(tx, actor, venue.brandId);
    const { rows } = await tx.query<PaymentOptionChangeRow>(
      `select id, actor_user_id as "actorUserId", actor_name as "actorName", changed_at as "changedAt", before, after
       from app.payment_option_changes where venue_id = $1 order by changed_at desc, id desc`,
      [venueId],
    );
    return rows.map(({ before, after, ...change }) => ({
      ...change,
      before: before && toPaymentOption(before),
      after: after && toPaymentOption(after),
    }));
  });
}

const optionTarget = venueInput.extend({ paymentOptionId: z.uuid(), revision: z.uuid() });
const updateInput = optionTarget.extend({
  changes: details.partial().extend({ active: z.boolean().optional() }),
  accountChange: z.object({
    before: details.shape.accountOrMerchantCode,
    after: details.shape.accountOrMerchantCode,
  }).optional(),
});

async function lockPaymentOption(tx: Tx, actor: Actor, target: z.output<typeof optionTarget>): Promise<PaymentOption> {
  const venue = await findVenue(tx, target.venueId);
  await requireBrandOwner(tx, actor, venue.brandId);
  const { rows } = await tx.query<PaymentOptionRow>(
    "select * from app.payment_options where venue_id = $1 and id = $2 for update",
    [venue.id, target.paymentOptionId],
  );
  const row = rows[0];
  if (!row) throw new MaasiiError("not_found", "Payment Option not found.");
  if (row.revision !== target.revision) {
    throw new MaasiiError("invalid_input", "The Payment Option changed while you were editing.", "paymentOptionChanged");
  }
  return toPaymentOption(row);
}

export async function updatePaymentOption(
  actor: Actor,
  input: z.input<typeof updateInput>,
  { now = new Date() }: { now?: Date } = {},
): Promise<PaymentOption> {
  const data = parseInput(updateInput, input);
  return inTransaction(actor, async (tx) => {
    const before = await lockPaymentOption(tx, actor, data);
    const changed = Object.entries(data.changes).filter(
      ([field, value]) => value !== undefined && before[field as keyof typeof data.changes] !== value,
    );
    if (changed.length === 0) return before;
    const after = { ...before, ...Object.fromEntries(changed) };
    requirePaymentDestination(after);
    if (before.accountOrMerchantCode !== after.accountOrMerchantCode &&
        (data.accountChange?.before !== before.accountOrMerchantCode ||
         data.accountChange?.after !== after.accountOrMerchantCode)) {
      throw new MaasiiError(
        "invalid_input",
        "Confirm the account number or merchant code change.",
        "paymentCodeConfirmationRequired",
      );
    }
    await setPaymentChangeTime(tx, now);
    const { rows } = await tx.query<PaymentOptionRow>(
      `update app.payment_options
       set kind = $2, provider = $3, recipient_name = $4, account_or_merchant_code = $5, qr_image = $6,
           display_order = $7, active = $8, revision = gen_random_uuid()
       where id = $1 returning *`,
      [before.id, after.kind, after.provider, after.recipientName, after.accountOrMerchantCode, after.qrImage,
        after.displayOrder, after.active],
    );
    return toPaymentOption(rows[0]);
  });
}

export async function removePaymentOption(
  actor: Actor,
  input: z.input<typeof optionTarget>,
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  const target = parseInput(optionTarget, input);
  await inTransaction(actor, async (tx) => {
    const option = await lockPaymentOption(tx, actor, target);
    await setPaymentChangeTime(tx, now);
    await tx.query("delete from app.payment_options where id = $1", [option.id]);
  });
}
