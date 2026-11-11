import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireBrandOwner, requirePlatformAdmin, requireSystem, requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
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
const venueInput = z.object({
  brandId: z.string(),
  name: z.string().trim().min(1, "Give the venue a name."),
  linkToken: z.string().optional(),
});

/**
 * The brand's Owner creates a Venue. Its Venue Link token is made from the brand and venue names
 * plus a random suffix (bilos-pastry-bole-x7k2), unless the platform passes one when seeding.
 */
export async function createVenue(
  actor: Actor,
  input: { brandId: string; name: string; linkToken?: string },
): Promise<Venue> {
  const { brandId, name, linkToken } = parseInput(venueInput, input);
  if (linkToken !== undefined) requireSystem(actor);
  return inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, brandId);
    const brand = await tx.query<{ name: string }>("select name from app.brands where id = $1", [brandId]);
    if (brand.rowCount === 0) throw new MaasiiError("not_found", "Brand not found.");

    const { rows } = await tx.query<Venue>(
      `insert into app.venues (brand_id, name, link_token) values ($1, $2, $3)
       returning id, brand_id as "brandId", name, link_token as "linkToken"`,
      [brandId, name, linkToken ?? newLinkToken(brand.rows[0].name, name)],
    );
    return rows[0];
  });
}

function newLinkToken(brandName: string, venueName: string): string {
  const slug = `${brandName} ${venueName}`
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const suffix = Array.from(randomBytes(4), (byte) => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36]).join("");
  return slug.length >= 3 ? `${slug}-${suffix}` : `venue-${suffix}${randomBytes(3).toString("hex")}`;
}

export type VenueTable = Table & { active: boolean };

export type VenueSetup = {
  venue: Venue;
  brand: { id: string; name: string };
  /** Every Table, active or not, by number. */
  tables: VenueTable[];
  /** Whether the caller is the brand's Owner, who also invites the venue's Managers. */
  isOwner: boolean;
};

/** What a Manager or Owner sees when setting up a Venue. */
export async function getVenueSetup(actor: Actor, input: { venueId: string }): Promise<VenueSetup> {
  return inTransaction(actor, async (tx) => {
    const venue = await findVenue(tx, input.venueId);
    await requireVenueManager(tx, actor, venue.id);
    const brand = await tx.query<{ id: string; name: string }>("select id, name from app.brands where id = $1", [
      venue.brandId,
    ]);
    const tables = await tx.query<VenueTable>(
      "select id, number, active from app.tables where venue_id = $1 order by number",
      [venue.id],
    );
    const owner = await tx.query<{ ok: boolean }>("select app.is_brand_owner($1) as ok", [venue.brandId]);
    return { venue, brand: brand.rows[0], tables: tables.rows, isOwner: actor.kind === "system" || owner.rows[0].ok };
  });
}

async function findVenue(tx: Tx, venueId: string): Promise<Venue> {
  const { rows } = z.uuid().safeParse(venueId).success
    ? await tx.query<Venue>(
        `select id, brand_id as "brandId", name, link_token as "linkToken" from app.venues where id = $1`,
        [venueId],
      )
    : { rows: [] };
  if (!rows[0]) throw new MaasiiError("not_found", "Venue not found.");
  return rows[0];
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
