import type { Actor } from "./actor";
import type { Tx } from "./db";
import { MaasiiError } from "./errors";

export function requireSystem(actor: Actor): void {
  if (actor.kind !== "system") {
    throw new MaasiiError("not_allowed", "Only the platform can do this.");
  }
}

export async function requireBrandOwner(tx: Tx, actor: Actor, brandId: string): Promise<void> {
  if (actor.kind === "system") return;
  if (actor.kind === "staff") {
    const { rows } = await tx.query<{ ok: boolean }>("select app.is_brand_owner($1) as ok", [brandId]);
    if (rows[0]?.ok) return;
  }
  throw new MaasiiError("not_allowed", "Only the brand's Owner can do this.");
}
