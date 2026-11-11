import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { requirePlatformAdmin, requireSystem } from "./access";
import { staffActor, type Actor } from "./actor";
import { contactText, parseStaffContact, type StaffContact } from "./contact";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { parseInput } from "./validation";

/** Makes an existing user an Owner of a Brand directly, for seeding and tests. People use invitations. */
export async function addBrandOwner(
  actor: Actor,
  input: { brandId: string; userId: string },
): Promise<void> {
  requireSystem(actor);
  await inTransaction(actor, async (tx) => {
    await tx.query(
      `insert into app.memberships (user_id, role, brand_id) values ($1, 'owner', $2)`,
      [input.userId, input.brandId],
    );
  });
}

/** Makes an existing user a platform admin. Only the platform itself (seeding, operations) can. */
export async function addPlatformAdmin(actor: Actor, input: { userId: string }): Promise<void> {
  requireSystem(actor);
  await inTransaction(actor, async (tx) => {
    await tx.query("insert into app.platform_admins (user_id) values ($1) on conflict do nothing", [input.userId]);
  });
}

// ---- Invitations -------------------------------------------------------------------------------

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export type StaffRole = "owner" | "manager";

/** A new invitation. The token is shown to the inviter once, as the link /invite/<token>. */
export type NewInvitation = { invitationId: string; token: string; expiresAt: Date };

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type Invitation = {
  status: InvitationStatus;
  role: StaffRole;
  name: string;
  /** The email or phone number the invitation was sent to; the person signs in with it. */
  contact: string;
  brand: { id: string; name: string };
  venue: { id: string; name: string } | null;
  expiresAt: Date;
};

const invitationInput = z.object({
  name: z.string().trim().min(1, "Enter the name of the person you are inviting."),
  contact: z.string(),
});

/** The platform admin invites a person to be a Brand's Owner. */
export async function inviteOwner(
  actor: Actor,
  input: { brandId: string; name: string; contact: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<NewInvitation> {
  const { name, contact } = parseInput(invitationInput, input);
  const to = parseStaffContact(contact);
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const brand = await tx.query("select 1 from app.brands where id = $1", [input.brandId]);
    if (brand.rowCount === 0) throw new MaasiiError("not_found", "Brand not found.");
    return createInvitation(tx, actor, { role: "owner", brandId: input.brandId, name, to, now });
  });
}

async function createInvitation(
  tx: Tx,
  actor: Actor,
  invitation: { role: StaffRole; brandId?: string; venueId?: string; name: string; to: StaffContact; now: Date },
): Promise<NewInvitation> {
  const email = "email" in invitation.to ? invitation.to.email : null;
  const phone = "phone" in invitation.to ? invitation.to.phone : null;
  const brandId = invitation.brandId ?? null;
  const venueId = invitation.venueId ?? null;

  // Inviting the same person to the same place again replaces the earlier link.
  await tx.query(
    `update app.invitations set revoked_at = $1
     where role = $2 and brand_id is not distinct from $3 and venue_id is not distinct from $4
       and email is not distinct from $5 and phone is not distinct from $6
       and accepted_at is null and revoked_at is null`,
    [invitation.now, invitation.role, brandId, venueId, email, phone],
  );

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(invitation.now.getTime() + INVITATION_LIFETIME_MS);
  const { rows } = await tx.query<{ id: string }>(
    `insert into app.invitations
       (role, brand_id, venue_id, name, email, phone, token_hash, invited_by, invited_at, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      invitation.role,
      brandId,
      venueId,
      invitation.name,
      email,
      phone,
      hashToken(token),
      actor.kind === "system" ? null : actor.userId,
      invitation.now,
      expiresAt,
    ],
  );
  return { invitationId: rows[0].id, token, expiresAt };
}

/** What the invitation link shows to whoever opens it, or null when no invitation has that token. */
export async function getInvitation(
  actor: Actor,
  input: { token: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<Invitation | null> {
  return inTransaction(actor, (tx) => findInvitation(tx, input.token, now));
}

async function findInvitation(tx: Tx, token: string, now: Date): Promise<Invitation | null> {
  const { rows } = await tx.query("select * from app.find_invitation($1, $2)", [hashToken(token), now]);
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    role: row.role,
    name: row.name,
    contact: row.email ?? row.phone,
    brand: { id: row.brand_id, name: row.brand_name },
    venue: row.venue_id ? { id: row.venue_id, name: row.venue_name } : null,
    expiresAt: row.expires_at,
  };
}

const refusals: Record<string, string> = {
  not_found: "This invitation link is not valid. Ask for a new one.",
  accepted: "This invitation has already been used. Sign in instead.",
  accepted_already: "This invitation has already been used. Sign in instead.",
  revoked: "This invitation was replaced by a newer one. Use the latest link you were sent.",
  expired: "This invitation has expired. Ask for a new one.",
  wrong_person: "This invitation was sent to someone else.",
};

/**
 * Accepts an invitation by setting a password. The person's Supabase Auth account is created for
 * the invited email or phone; if they already have one, they must enter its password instead.
 * They can then sign in with that email or phone and password.
 */
export async function acceptInvitation(
  _actor: Actor,
  input: { token: string; password: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ userId: string; contact: StaffContact }> {
  const { token, password } = parseInput(
    z.object({
      token: z.string().min(1),
      password: z.string().min(MIN_PASSWORD_LENGTH, `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`),
    }),
    input,
  );

  const invitation = await inTransaction({ kind: "public" }, (tx) => findInvitation(tx, token, now));
  if (!invitation) throw new MaasiiError("not_found", refusals.not_found);
  if (invitation.status !== "pending") throw new MaasiiError("not_allowed", refusals[invitation.status]);

  const contact = parseStaffContact(invitation.contact);
  const { userId, created } = await findOrCreateAuthUser(contact, password, invitation.name);
  try {
    const outcome = await inTransaction(staffActor(userId), async (tx) => {
      const { rows } = await tx.query<{ outcome: string }>(
        "select app.accept_invitation($1, $2) as outcome",
        [hashToken(token), now],
      );
      return rows[0].outcome;
    });
    if (outcome !== "accepted") throw new MaasiiError("not_allowed", refusals[outcome] ?? refusals.not_found);
  } catch (error) {
    if (created) await createAdminClient().auth.admin.deleteUser(userId);
    throw error;
  }
  return { userId, contact };
}

async function findOrCreateAuthUser(
  contact: StaffContact,
  password: string,
  name: string,
): Promise<{ userId: string; created: boolean }> {
  const identity =
    "email" in contact
      ? { email: contact.email, email_confirm: true }
      : { phone: contact.phone, phone_confirm: true };
  const { data, error } = await createAdminClient().auth.admin.createUser({
    ...identity,
    password,
    user_metadata: { name },
  });
  if (!error) return { userId: data.user.id, created: true };
  if (error.code !== "email_exists" && error.code !== "phone_exists") throw error;

  const signIn = await createPublicAuthClient().auth.signInWithPassword({ ...contact, password });
  if (signIn.error) {
    throw new MaasiiError(
      "not_allowed",
      `${contactText(contact)} already has a Maasii account. Enter that account's password to accept.`,
    );
  }
  return { userId: signIn.data.user.id, created: false };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---- Who am I ----------------------------------------------------------------------------------

export type MyAccess = {
  userId: string;
  /** The name the person was invited with, if any. */
  name: string | null;
  isPlatformAdmin: boolean;
  /** Brands the person owns, with all their Venues. */
  brands: { id: string; name: string; role: "owner"; venues: { id: string; name: string }[] }[];
  /** Venues the person manages, outside the brands they own. */
  venues: { id: string; name: string; brandId: string; brandName: string; role: "manager" }[];
};

/** Where the signed-in person may work: the brands they own and the venues they manage. */
export async function getMyAccess(actor: Actor): Promise<MyAccess> {
  if (actor.kind !== "staff" && actor.kind !== "admin") {
    throw new MaasiiError("not_allowed", "Sign in to see where you work.");
  }
  return inTransaction(actor, async (tx) => {
    const admin = await tx.query<{ ok: boolean }>("select app.is_platform_admin() as ok");
    const memberships = await tx.query<{
      role: string;
      name: string | null;
      brand_id: string | null;
      brand_name: string;
      venue_id: string | null;
      venue_name: string | null;
    }>(
      `select m.role, m.name, b.id as brand_id, b.name as brand_name, v.id as venue_id, v.name as venue_name
       from app.memberships m
       left join app.venues v on v.id = m.venue_id
       join app.brands b on b.id = coalesce(m.brand_id, v.brand_id)
       where m.user_id = $1 and m.active
       order by b.name, v.name`,
      [actor.userId],
    );

    const owned = memberships.rows.filter((m) => m.role === "owner");
    const ownedVenues = await tx.query<{ id: string; name: string; brand_id: string }>(
      `select id, name, brand_id from app.venues where brand_id = any($1::uuid[]) order by name`,
      [owned.map((m) => m.brand_id)],
    );
    const ownedBrandIds = new Set(owned.map((m) => m.brand_id));

    return {
      userId: actor.userId,
      name: memberships.rows.find((m) => m.name)?.name ?? null,
      isPlatformAdmin: admin.rows[0].ok,
      brands: owned.map((m) => ({
        id: m.brand_id!,
        name: m.brand_name,
        role: "owner" as const,
        venues: ownedVenues.rows.filter((v) => v.brand_id === m.brand_id).map(({ id, name }) => ({ id, name })),
      })),
      venues: memberships.rows
        .filter((m) => m.role === "manager" && !ownedBrandIds.has(m.brand_id))
        .map((m) => ({
          id: m.venue_id!,
          name: m.venue_name!,
          brandId: m.brand_id!,
          brandName: m.brand_name,
          role: "manager" as const,
        })),
    };
  });
}
