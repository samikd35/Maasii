import { z } from "zod";
import { requirePlatformAdmin, requireSystem } from "./access";
import type { Actor } from "./actor";
import { inTransaction } from "./db";
import { parseInput } from "./validation";

export type Brand = { id: string; name: string; logoUrl: string | null };
export type Venue = { id: string; brandId: string; name: string; linkToken: string };
export type Table = { id: string; number: number };

const brandInput = z.object({
  name: z.string().trim().min(1, "Give the brand a name."),
  logoUrl: z.string().optional(),
});

/** The platform admin creates a Brand, then invites its Owner. */
export async function createBrand(
  actor: Actor,
  input: { name: string; logoUrl?: string },
): Promise<Brand> {
  const { name, logoUrl } = parseInput(brandInput, input);
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const { rows } = await tx.query<Brand>(
      `insert into app.brands (name, logo_url) values ($1, $2)
       returning id, name, logo_url as "logoUrl"`,
      [name, logoUrl ?? null],
    );
    return rows[0];
  });
}

export type BrandSummary = Brand & { venueCount: number };

/** Every Brand on the platform, newest first, for the platform admin. */
export async function listBrands(actor: Actor): Promise<BrandSummary[]> {
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const { rows } = await tx.query<BrandSummary>(
      `select b.id, b.name, b.logo_url as "logoUrl",
              (select count(*)::int from app.venues v where v.brand_id = b.id) as "venueCount"
       from app.brands b
       order by b.created_at desc, b.name`,
    );
    return rows;
  });
}

/** Creates a Venue with its Venue Link. Without a `linkToken`, a random one is generated. */
export async function createVenue(
  actor: Actor,
  input: { brandId: string; name: string; linkToken?: string },
): Promise<Venue> {
  requireSystem(actor);
  return inTransaction(actor, async (tx) => {
    const linkToken = input.linkToken ?? crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const { rows } = await tx.query<Venue>(
      `insert into app.venues (brand_id, name, link_token) values ($1, $2, $3)
       returning id, brand_id as "brandId", name, link_token as "linkToken"`,
      [input.brandId, input.name, linkToken],
    );
    return rows[0];
  });
}

export async function addTables(
  actor: Actor,
  input: { venueId: string; numbers: number[] },
): Promise<Table[]> {
  requireSystem(actor);
  return inTransaction(actor, async (tx) => {
    const { rows } = await tx.query<Table>(
      `insert into app.tables (venue_id, number)
       select $1, n from unnest($2::int[]) as n
       returning id, number`,
      [input.venueId, input.numbers],
    );
    return rows.sort((a, b) => a.number - b.number);
  });
}
