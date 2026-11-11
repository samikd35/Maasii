import { requireSystem } from "./access";
import type { Actor } from "./actor";
import { inTransaction } from "./db";

/** Makes an existing user an Owner of a Brand. Ticket 07 replaces this with owner invitations. */
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
