import { requireSystem } from "./access";
import type { Actor } from "./actor";
import { inTransaction } from "./db";

// Only the platform (seeding and tests) sets up brands, venues and tables so far.
// Ticket 07 opens these commands to the platform admin, owners and managers.

export type Brand = { id: string; name: string; logoUrl: string | null };
export type Venue = { id: string; brandId: string; name: string; linkToken: string };
export type Table = { id: string; number: number };

export async function createBrand(
  actor: Actor,
  input: { name: string; logoUrl?: string },
): Promise<Brand> {
  requireSystem(actor);
  return inTransaction(actor, async (tx) => {
    const { rows } = await tx.query<Brand>(
      `insert into app.brands (name, logo_url) values ($1, $2)
       returning id, name, logo_url as "logoUrl"`,
      [input.name, input.logoUrl ?? null],
    );
    return rows[0];
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
