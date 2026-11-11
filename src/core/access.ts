import type { Actor } from "./actor";
import type { Tx } from "./db";
import { MaasiiError } from "./errors";

export function requireOutsideBrandSupport(actor: Actor): asserts actor is Exclude<Actor, { kind: "support" }> {
  if (actor.kind === "support") throw new MaasiiError("not_allowed", "Brand support is read-only.");
}

export function requireSystem(actor: Actor): void {
  if (actor.kind !== "system") {
    throw new MaasiiError("not_allowed", "Only the platform can do this.");
  }
}

/** The platform itself, or a signed-in platform admin acting as one. */
export async function requirePlatformAdmin(tx: Tx, actor: Actor): Promise<void> {
  if (actor.kind === "system") return;
  if (actor.kind === "admin") {
    const { rows } = await tx.query<{ ok: boolean }>("select app.is_platform_admin() as ok");
    if (rows[0]?.ok) return;
  }
  throw new MaasiiError("not_allowed", "Only the platform admin can do this.");
}

/** The Venue's Manager, or an Owner of its Brand. */
export async function requireVenueManager(tx: Tx, actor: Actor, venueId: string): Promise<void> {
  if (actor.kind === "system") return;
  if (actor.kind === "staff") {
    const { rows } = await tx.query<{ ok: boolean }>("select app.can_manage_venue($1) as ok", [venueId]);
    if (rows[0]?.ok) return;
  }
  throw new MaasiiError("not_allowed", "Only this venue's Manager or the brand's Owner can do this.");
}

export async function requireBrandOwner(tx: Tx, actor: Actor, brandId: string): Promise<void> {
  if (actor.kind === "system") return;
  if (actor.kind === "staff") {
    const { rows } = await tx.query<{ ok: boolean }>("select app.is_brand_owner($1) as ok", [brandId]);
    if (rows[0]?.ok) return;
  }
  throw new MaasiiError("not_allowed", "Only the brand's Owner can do this.");
}
