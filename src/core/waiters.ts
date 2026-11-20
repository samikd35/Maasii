import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { requireOutsideBrandSupport, requireVenueManager } from "./access";
import { staffActor, systemActor, type Actor } from "./actor";
import { findVenue } from "./brands";
import { parseStaffContact } from "./contact";
import { inTransaction, type Tx } from "./db";
import type { Bilingual } from "./language";
import { MaasiiError } from "./errors";
import { readPublishedMenu } from "./menu";
import { qrPng } from "./qr";
import { closeWaiterAssignments, lockVenueShifts } from "./shifts";
import { parseInput } from "./validation";

export const WAITER_JOIN_MINUTES = 5;
const MAX_PIN_FAILURES = 5;
const UNLOCK_MS = 8 * 60 * 60 * 1000;
const pinInput = z.string().regex(/^[0-9]{6}$/, "Enter a 6-digit PIN.");
const unlockPinInput = z.string().regex(/^(?:[0-9]{4}|[0-9]{6})$/, "Enter your PIN.");
const SIGN_IN_COOLDOWN_MS = 30 * 60 * 1000;
const nameInput = z.string().trim().min(1, "Enter your name.").max(80, "Use at most 80 characters.");
const derivePin = promisify(scrypt);

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function waiterPhone(value: string) {
  try {
    const contact = parseStaffContact(value);
    if ("phone" in contact) return contact.phone;
  } catch (error) {
    if (!(error instanceof MaasiiError)) throw error;
  }
  throw new MaasiiError("invalid_input", "Enter a phone number.", "invalidWaiterPhone");
}

async function verifyPin(pin: string, encoded: string) {
  const [salt, verifier] = encoded.split(":");
  return timingSafeEqual(await derivePin(pin, salt, 32) as Buffer, Buffer.from(verifier, "hex"));
}

async function createWaiterSession(email: string, expectedUserId?: string) {
  const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;
  const auth = createPublicAuthClient().auth;
  // Verify the generated credential on the server to establish the enrolled browser's session.
  const { data, error } = await auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
  if (error) throw error;
  if (!data.session || !data.user || data.user.id !== (expectedUserId ?? link.user.id)) {
    throw new Error("Waiter Auth session was not issued for the expected person.");
  }
  const { data: jwt, error: jwtError } = await auth.getClaims(data.session.access_token);
  if (jwtError) throw jwtError;
  const sessionId = z.uuid().parse(jwt?.claims.session_id);
  return {
    sessionId,
    actor: staffActor(data.user.id, sessionId),
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
  };
}

async function enrollWaiterDevice(
  tx: Tx, sessionId: string, waiterId: string, verifier: string, now: Date,
) {
  const unlockToken = newToken();
  await tx.query(
    `insert into app.waiter_devices (session_id, waiter_id, pin_verifier, unlock_hash, unlocked_until)
     values ($1, $2, $3, $4, $5)`,
    [sessionId, waiterId, verifier, tokenHash(unlockToken), new Date(now.getTime() + UNLOCK_MS)],
  );
  return unlockToken;
}

export async function createWaiterJoinCode(
  actor: Actor,
  input: { venueId: string; waiterId?: string; siteUrl: string },
  { now = new Date() }: { now?: Date } = {},
) {
  const { venueId, waiterId, siteUrl } = parseInput(z.object({
    venueId: z.uuid(),
    waiterId: z.uuid().optional(),
    siteUrl: z.url({ protocol: /^https?$/ }),
  }), input);
  const token = newToken();
  const url = new URL(`/join/${token}`, siteUrl).toString();
  const image = await qrPng(url);
  const expiresAt = new Date(now.getTime() + WAITER_JOIN_MINUTES * 60 * 1000);
  await inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    if (waiterId) {
      const { rowCount } = await tx.query(
        "select 1 from app.memberships where id = $1 and venue_id = $2 and role = 'waiter' and active",
        [waiterId, venueId],
      );
      if (!rowCount) throw new MaasiiError("not_found", "Waiter not found.");
    }
    await tx.query(
      "insert into app.waiter_join_codes (token_hash, venue_id, waiter_id, expires_at) values ($1, $2, $3, $4)",
      [tokenHash(token), venueId, waiterId ?? null, expiresAt],
    );
  });
  return { token, url, qrPng: image, expiresAt };
}

type JoinCode = {
  id: string;
  venueId: string;
  venueName: string;
  waiterId: string | null;
  waiterName: string | null;
  usedAt: Date | null;
  expiresAt: Date;
};

async function findJoinCode(tx: Tx, token: string, lock = false): Promise<JoinCode | undefined> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return;
  const { rows } = await tx.query<JoinCode>(
    `select c.id, c.venue_id as "venueId", v.name as "venueName",
            c.waiter_id as "waiterId", m.name as "waiterName", c.used_at as "usedAt", c.expires_at as "expiresAt"
     from app.waiter_join_codes c join app.venues v on v.id = c.venue_id
     left join app.memberships m on m.id = c.waiter_id
     where c.token_hash = $1 and (c.waiter_id is null or m.active)
     ${lock ? "for update of c" : ""}`,
    [tokenHash(token)],
  );
  return rows[0];
}

function joinStatus(code: JoinCode, now: Date) {
  if (code.usedAt) return "used";
  return code.expiresAt <= now ? "expired" : "pending";
}

/** The QR token is the credential. Only return what the join screen needs. */
export async function getWaiterJoinCode(
  _actor: Actor,
  input: { token: string },
  { now = new Date() }: { now?: Date } = {},
) {
  return inTransaction(systemActor, async (tx) => {
    const code = await findJoinCode(tx, input.token);
    return code ? { status: joinStatus(code, now), venueName: code.venueName, waiterName: code.waiterName } : null;
  });
}

export async function joinWaiter(
  actor: Actor,
  input: { token: string; name: string; phone: string; pin: string },
  { now }: { now?: Date } = {},
) {
  requireOutsideBrandSupport(actor);
  const pin = parseInput(pinInput, input.pin, "invalidPin");
  const phone = waiterPhone(input.phone);
  return inTransaction(systemActor, async (tx) => {
    const code = await findJoinCode(tx, input.token, true);
    if (!code) throw new MaasiiError("not_found", "This join QR is not valid. Ask your manager for a new one.", "waiterJoinInvalid");
    const at = now ?? new Date();
    const status = joinStatus(code, at);
    if (status === "used") {
      throw new MaasiiError("not_allowed", "This join QR has already been used.", "waiterJoinUsed");
    }
    if (status === "expired") {
      throw new MaasiiError("not_allowed", "This join QR has expired.", "waiterJoinExpired");
    }

    // The private code ID gives retries the same Auth identity, even after a partial Auth failure.
    let email = `waiter-${code.id}@maasii.invalid`;
    let existingUserId: string | undefined;
    if (code.waiterId) {
      // Serialize sign-in with other joins and with removal of this Waiter.
      const { rows } = await tx.query<{ email: string; userId: string }>(
        `select u.email, m.user_id as "userId" from app.memberships m join auth.users u on u.id = m.user_id
         where m.id = $1 and m.venue_id = $2 and m.role = 'waiter' and m.active for update of m`,
        [code.waiterId, code.venueId],
      );
      if (!rows[0]) throw new MaasiiError("not_allowed", "This Waiter no longer has access.", "waiterJoinInvalid");
      ({ email, userId: existingUserId } = rows[0]);
    }
    const name = code.waiterName ?? parseInput(nameInput, input.name, "waiterNameRequired");
    const identity = await createWaiterSession(email, existingUserId);

    let waiterId = code.waiterId;
    if (!waiterId) {
      const { rows } = await tx.query<{ id: string }>(
        `insert into app.memberships (user_id, role, venue_id, name) values ($1, 'waiter', $2, $3) returning id`,
        [identity.actor.userId, code.venueId, name],
      );
      waiterId = rows[0].id;
    }
    const salt = randomBytes(16).toString("hex");
    const pinHash = (await derivePin(pin, salt, 32) as Buffer).toString("hex");
    const verifier = `${salt}:${pinHash}`;
    await tx.query(
      `insert into app.waiter_sign_ins (waiter_id, phone, pin_verifier) values ($1, $2, $3)
       on conflict (waiter_id) do update set phone = excluded.phone, pin_verifier = excluded.pin_verifier,
         failed_attempts = 0, blocked_until = null`,
      [waiterId, phone, verifier],
    );
    if (code.waiterId) {
      await tx.query(
        `update app.waiter_devices set pin_verifier = $2, failed_attempts = 0, unlock_hash = null, unlocked_until = null
         where waiter_id = $1`, [waiterId, verifier],
      );
    }
    const unlockToken = await enrollWaiterDevice(tx, identity.sessionId, waiterId, verifier, at);
    await tx.query("update app.waiter_join_codes set used_at = $2 where id = $1", [code.id, at]);
    return { ...identity, waiterId, unlockToken };
  }).catch((error) => {
    if (error?.constraint === "waiter_sign_ins_phone_key") {
      throw new MaasiiError("invalid_input", "That phone number is already linked to a Waiter.", "waiterPhoneTaken");
    }
    throw error;
  });
}

export async function signInWaiter(input: { phone: string; pin: string }, { now }: { now?: Date } = {}) {
  const phone = waiterPhone(input.phone);
  const pin = parseInput(pinInput, input.pin, "invalidPin");
  const result = await inTransaction(systemActor, async (tx) => {
    const { rows: [account] } = await tx.query<{
      waiterId: string; userId: string; email: string; verifier: string; attempts: number; blockedUntil: Date | null;
    }>(
      `select m.id as "waiterId", m.user_id as "userId", u.email, c.pin_verifier as verifier,
              c.failed_attempts as attempts, c.blocked_until as "blockedUntil"
       from app.waiter_sign_ins c join app.memberships m on m.id = c.waiter_id
       join auth.users u on u.id = m.user_id
       where c.phone = $1 and m.active and m.role = 'waiter'
         and not exists (select 1 from app.memberships other where other.user_id = m.user_id and other.active and other.id <> m.id)
         and not exists (select 1 from app.platform_admins admin where admin.user_id = m.user_id)
       for update of m, c`, [phone],
    );
    const at = now ?? new Date();
    if (!account || (account.blockedUntil && account.blockedUntil > at)) return null;
    if (!await verifyPin(pin, account.verifier)) {
      const attempts = account.blockedUntil ? 1 : account.attempts + 1;
      const blockedUntil = attempts === MAX_PIN_FAILURES ? new Date(at.getTime() + SIGN_IN_COOLDOWN_MS) : null;
      await tx.query(
        "update app.waiter_sign_ins set failed_attempts = $2, blocked_until = $3 where waiter_id = $1",
        [account.waiterId, attempts, blockedUntil],
      );
      return null;
    }
    const identity = await createWaiterSession(account.email, account.userId);
    const unlockToken = await enrollWaiterDevice(tx, identity.sessionId, account.waiterId, account.verifier, at);
    await tx.query("update app.waiter_sign_ins set failed_attempts = 0, blocked_until = null where waiter_id = $1", [account.waiterId]);
    return { ...identity, unlockToken };
  });
  if (result) return result;
  throw new MaasiiError("not_allowed", "Check your phone number and PIN, or try again later.", "waiterSignInFailed");
}

type WaiterDevice = {
  active: boolean;
  sessionId: string | null;
  waiterId: string;
  name: string;
  venueId: string;
  venueName: string;
  attempts: number | null;
  unlockHash: string | null;
  unlockedUntil: Date | null;
  hasPush: boolean;
};

export type WaiterSession =
  | { status: "locked" | "rejoin" }
  | { status: "unlocked"; name: string; waiterId: string; venue: { id: string; name: string }; hasPush: boolean;
      menu: { id: string; name: Bilingual; dishes: { id: string; name: Bilingual; priceSantim: number }[] }[] };

/** Reads the enrolled device for this verified Auth session, before or after PIN unlock. */
export async function getWaiterSession(
  actor: Actor,
  input: { unlockToken?: string; includeMenu?: boolean } = {},
  { now = new Date() }: { now?: Date } = {},
): Promise<WaiterSession | null> {
  if (actor.kind !== "staff") return null;
  return inTransaction(systemActor, async (tx) => {
    const { rows } = await tx.query<WaiterDevice>(
      `select m.active, d.session_id as "sessionId", m.name, m.id as "waiterId",
              v.id as "venueId", v.name as "venueName",
              d.failed_attempts as attempts, d.unlock_hash as "unlockHash", d.unlocked_until as "unlockedUntil",
              exists (select 1 from app.waiter_push_subscriptions p where p.session_id = d.session_id) as "hasPush"
       from app.memberships m
       join app.venues v on v.id = m.venue_id
       left join app.waiter_devices d on d.waiter_id = m.id and d.session_id = $2
       where m.user_id = $1 and m.role = 'waiter'
       order by d.session_id nulls last limit 1`,
      [actor.userId, actor.sessionId ?? null],
    );
    const device = rows[0];
    if (!device) return null;
    if (!device.active || !device.sessionId || device.attempts === MAX_PIN_FAILURES) return { status: "rejoin" };
    if (!input.unlockToken || !device.unlockedUntil || device.unlockedUntil <= now ||
        tokenHash(input.unlockToken) !== device.unlockHash) {
      return { status: "locked" };
    }
    const published = input.includeMenu
      ? await readPublishedMenu(tx, { venueLinkToken: (await findVenue(tx, device.venueId)).linkToken }, now)
      : undefined;
    const menu = published?.menuSections.map(({ sectionId, name, dishes }) => ({
      id: sectionId, name, dishes: dishes.map(({ dishId, name, priceSantim }) => ({ id: dishId, name, priceSantim })),
    })) ?? [];
    return { status: "unlocked", name: device.name, waiterId: device.waiterId, venue: { id: device.venueId, name: device.venueName }, hasPush: device.hasPush, menu };
  });
}

function rejoinRequired(): MaasiiError {
  return new MaasiiError("not_allowed", "Ask your manager for a fresh join QR.", "waiterRejoin");
}

export async function unlockWaiter(
  actor: Actor,
  input: { pin: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ unlockToken: string }> {
  if (actor.kind !== "staff" || !actor.sessionId) throw rejoinRequired();
  const pin = parseInput(unlockPinInput, input.pin, "invalidPin");

  const result = await inTransaction(systemActor, async (tx) => {
    const { rows } = await tx.query<{ verifier: string; attempts: number }>(
      `select d.pin_verifier as verifier, d.failed_attempts as attempts
       from app.waiter_devices d join app.memberships m on m.id = d.waiter_id
       where d.session_id = $1 and m.user_id = $2 and m.role = 'waiter' and m.active for update of d`,
      [actor.sessionId, actor.userId],
    );
    const device = rows[0];
    if (!device || device.attempts >= MAX_PIN_FAILURES) return { status: "rejoin" } as const;

    const correct = await verifyPin(pin, device.verifier);
    if (!correct) {
      const attempts = device.attempts + 1;
      await tx.query(
        `update app.waiter_devices set failed_attempts = $2, unlock_hash = null, unlocked_until = null
         where session_id = $1`,
        [actor.sessionId, attempts],
      );
      return { status: attempts === MAX_PIN_FAILURES ? "rejoin" : "wrongPin" } as const;
    }

    const unlockToken = newToken();
    await tx.query(
      `update app.waiter_devices set failed_attempts = 0, unlock_hash = $2, unlocked_until = $3
       where session_id = $1`,
      [actor.sessionId, tokenHash(unlockToken), new Date(now.getTime() + UNLOCK_MS)],
    );
    return { status: "unlocked", unlockToken } as const;
  });

  // Refuse after the transaction commits so the failed attempt still counts.
  if (result.status === "unlocked") return { unlockToken: result.unlockToken };
  if (result.status === "wrongPin") throw new MaasiiError("not_allowed", "That PIN is not right.", "wrongPin");
  throw rejoinRequired();
}

export async function lockWaiter(actor: Actor): Promise<void> {
  if (actor.kind !== "staff" || !actor.sessionId) return;
  await inTransaction(systemActor, async (tx) => {
    await tx.query(
      `update app.waiter_devices d set unlock_hash = null, unlocked_until = null from app.memberships m
       where d.waiter_id = m.id and d.session_id = $1 and m.user_id = $2 and m.role = 'waiter' and m.active`,
      [actor.sessionId, actor.userId],
    );
  });
}

export async function removeWaiter(
  actor: Actor,
  input: { venueId: string; waiterId: string },
  { now }: { now?: Date } = {},
): Promise<void> {
  const { venueId, waiterId } = parseInput(z.object({ venueId: z.uuid(), waiterId: z.uuid() }), input);
  await inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    await lockVenueShifts(tx, venueId);
    const { rowCount } = await tx.query(
      "update app.memberships set active = false where id = $1 and venue_id = $2 and role = 'waiter' and active",
      [waiterId, venueId],
    );
    if (rowCount) await closeWaiterAssignments(tx, venueId, waiterId, now ?? new Date());
  });
}

type OrderWaiter = { id: string; name: string; venueId: string; topic: string };

export async function requireOrderWaiter(tx: Tx, actor: Actor, unlockToken: string | undefined, at: Date): Promise<OrderWaiter> {
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
