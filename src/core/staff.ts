import { requireSystem } from "./access";
import type { Actor } from "./actor";
import { inTransaction } from "./db";

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
