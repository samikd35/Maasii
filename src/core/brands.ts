import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireBrandOwner, requirePlatformAdmin, requireSystem, requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { brandArtworkBucket, prepareBrandArtwork, uploadBrandArtwork } from "./brand-artwork";
import { brandColourError, brandColourPattern, defaultBrandColour, displayFonts, type DisplayFont } from "./brand-theme";
import { inTransaction, lockVenueShifts, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { qrPng } from "./qr";
import { parseInput } from "./validation";

export type Brand = {
  id: string;
  name: string;
  logoUrl: string | null;
  colour: string;
  coverUrl: string | null;
  displayFont: DisplayFont;
};
export type Venue = { id: string; brandId: string; name: string; linkToken: string };
export type Table = { id: string; number: number };

const brandColourInput = z.string().regex(brandColourPattern, brandColourError).toUpperCase();

const brandInput = z.object({
  name: z.string().trim().min(1, "Give the brand a name."),
  logoUrl: z.string().optional(),
  colour: brandColourInput.default(defaultBrandColour),
  coverUrl: z.union([z.string().regex(/^\/(?![/\\])[^\s\\]*$/), z.url({ protocol: /^https?$/ })]).optional(),
  displayFont: z.enum(displayFonts).default("noto-sans-ethiopic"),
});

/** The platform admin creates a Brand, then invites its Owner. */
export async function createBrand(
  actor: Actor,
  input: z.input<typeof brandInput>,
): Promise<Brand> {
  const { name, logoUrl, colour, coverUrl, displayFont } = parseInput(brandInput, input);
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const { rows } = await tx.query<Brand>(
      `insert into app.brands (name, logo_url, colour, cover_url, display_font) values ($1, $2, $3, $4, $5)
       returning id, name, logo_url as "logoUrl", colour, cover_url as "coverUrl", display_font as "displayFont"`,
      [name, logoUrl ?? null, colour, coverUrl ?? null, displayFont],
    );
    return rows[0];
  });
}

export async function getBranding(actor: Actor, input: { brandId: string }): Promise<Brand> {
  const brandId = parseInput(z.uuid(), input.brandId);
  return inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, brandId);
    const { rows } = await tx.query<Brand>(
      `select id, name, logo_url as "logoUrl", colour, cover_url as "coverUrl", display_font as "displayFont"
       from app.brands where id = $1`,
      [brandId],
    );
    if (!rows[0]) throw new MaasiiError("not_found", "Brand not found.");
    return rows[0];
  });
}

const brandingInput = z.object({
  brandId: z.uuid(),
  colour: brandColourInput,
  displayFont: z.enum(displayFonts),
  logo: z.file().optional(),
  cover: z.file().optional(),
});

/** Change the look of every Venue of a Brand. */
export async function updateBranding(actor: Actor, input: z.input<typeof brandingInput>): Promise<Brand> {
  const { brandId, colour, displayFont, logo, cover } = parseInput(brandingInput, input);
  return inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, brandId);
    const [logoBytes, coverBytes] = await Promise.all([
      logo && prepareBrandArtwork(logo, 512, 192),
      cover && prepareBrandArtwork(cover, 1440, 960),
    ]);
    const bucket = logoBytes || coverBytes ? brandArtworkBucket() : null;
    const uploaded: string[] = [];
    async function upload(kind: "logo" | "cover", bytes: Buffer | undefined) {
      if (!bytes || !bucket) return null;
      const path = `${brandId}/${kind}-${randomUUID()}.webp`;
      uploaded.push(path);
      return uploadBrandArtwork(bucket, path, bytes);
    }

    try {
      // ponytail: keep superseded files for cached menus. Prune unreferenced artwork if storage grows.
      const logoUrl = await upload("logo", logoBytes);
      const coverUrl = await upload("cover", coverBytes);
      const { rows } = await tx.query<Brand>(
        `update app.brands
         set colour = $2, display_font = $3, logo_url = coalesce($4, logo_url), cover_url = coalesce($5, cover_url)
         where id = $1
         returning id, name, logo_url as "logoUrl", colour, cover_url as "coverUrl", display_font as "displayFont"`,
        [brandId, colour, displayFont, logoUrl, coverUrl],
      );
      if (!rows[0]) throw new MaasiiError("not_found", "Brand not found.");
      return rows[0];
    } catch (error) {
      if (bucket && uploaded.length) await bucket.remove(uploaded).catch(() => {});
      throw error;
    }
  });
}

export type BrandSummary = Brand & { venueCount: number };

/** Every Brand on the platform, newest first, for the platform admin. */
export async function listBrands(actor: Actor): Promise<BrandSummary[]> {
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const { rows } = await tx.query<BrandSummary>(
      `select b.id, b.name, b.logo_url as "logoUrl", b.colour, b.cover_url as "coverUrl", b.display_font as "displayFont",
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

export type VenueLink = {
  /** The Venue Link, the same on every table: https://<site>/v/<token>. */
  url: string;
  /** A QR image of the Venue Link, for table cards. */
  qrPng: Uint8Array;
  qrFileName: string;
};

/** The Venue Link and its QR image, for a Venue's Manager or the brand's Owner. */
export async function getVenueLink(actor: Actor, input: { venueId: string; siteUrl: string }): Promise<VenueLink> {
  const site = parseInput(z.object({ siteUrl: z.url({ protocol: /^https?$/ }) }), input).siteUrl;
  const venue = await inTransaction(actor, async (tx) => {
    const venue = await findVenue(tx, input.venueId);
    await requireVenueManager(tx, actor, venue.id);
    return venue;
  });
  const url = new URL(`/v/${venue.linkToken}`, site).toString();
  // Margin and size suit printing: 4 modules of quiet zone, about 6 cm at 300 dpi.
  return { url, qrPng: await qrPng(url), qrFileName: `${venue.linkToken}-qr.png` };
}

export async function findVenue(tx: Tx, venueId: string): Promise<Venue> {
  const { rows } = z.uuid().safeParse(venueId).success
    ? await tx.query<Venue>(
        `select id, brand_id as "brandId", name, link_token as "linkToken" from app.venues where id = $1`,
        [venueId],
      )
    : { rows: [] };
  if (!rows[0]) throw new MaasiiError("not_found", "Venue not found.");
  return rows[0];
}

const tableNumber = z
  .number({ error: "A table number must be a whole number from 1 to 9999." })
  .int("A table number must be a whole number from 1 to 9999.")
  .min(1, "A table number must be a whole number from 1 to 9999.")
  .max(9999, "A table number must be a whole number from 1 to 9999.");

/** A Venue's Manager or the brand's Owner adds Tables with new numbers. */
export async function addTables(
  actor: Actor,
  input: { venueId: string; numbers: number[] },
): Promise<Table[]> {
  const { numbers } = parseInput(z.object({ numbers: z.array(tableNumber) }), input, "invalidTableNumber");
  const repeated = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (repeated !== undefined) throw new MaasiiError("invalid_input", `Table ${repeated} is listed twice.`);

  return inTransaction(actor, async (tx) => {
    const venue = await findVenue(tx, input.venueId);
    await requireVenueManager(tx, actor, venue.id);
    const taken = await tx.query<{ number: number }>(
      "select number from app.tables where venue_id = $1 and number = any($2::int[]) order by number",
      [venue.id, numbers],
    );
    if (taken.rows[0]) throw tableNumberTaken(taken.rows[0].number);

    const { rows } = await uniqueTableNumbers(() =>
      tx.query<Table>(
        `insert into app.tables (venue_id, number)
         select $1, n from unnest($2::int[]) as n
         returning id, number`,
        [venue.id, numbers],
      ),
    );
    return rows.sort((a, b) => a.number - b.number);
  });
}

/** Gives a Table a new number. Its history (Visits, Orders) stays with it. */
export async function renumberTable(actor: Actor, input: { tableId: string; number: number }): Promise<void> {
  const { number } = parseInput(z.object({ number: tableNumber }), input, "invalidTableNumber");
  await inTransaction(actor, async (tx) => {
    const table = await findTable(tx, actor, input.tableId);
    await lockVenueShifts(tx, table.venueId);
    const taken = await tx.query(
      "select 1 from app.tables where venue_id = $1 and number = $2 and id <> $3",
      [table.venueId, number, table.id],
    );
    if (taken.rowCount) throw tableNumberTaken(number);
    await uniqueTableNumbers(() => tx.query("update app.tables set number = $2 where id = $1", [table.id, number]));
  });
}

/** Deactivates a Table (guests can no longer choose it) or brings it back. Its number stays reserved. */
export async function setTableActive(actor: Actor, input: { tableId: string; active: boolean }): Promise<void> {
  const { active } = parseInput(z.object({ active: z.boolean() }), input);
  await inTransaction(actor, async (tx) => {
    const table = await findTable(tx, actor, input.tableId);
    await lockVenueShifts(tx, table.venueId);
    await tx.query("update app.tables set active = $2 where id = $1", [table.id, active]);
  });
}

async function findTable(tx: Tx, actor: Actor, tableId: string): Promise<{ id: string; venueId: string }> {
  const { rows } = z.uuid().safeParse(tableId).success
    ? await tx.query<{ id: string; venueId: string }>(
        `select id, venue_id as "venueId" from app.tables where id = $1`,
        [tableId],
      )
    : { rows: [] };
  if (!rows[0]) throw new MaasiiError("not_found", "Table not found.");
  await requireVenueManager(tx, actor, rows[0].venueId);
  return rows[0];
}

function tableNumberTaken(number: number): MaasiiError {
  return new MaasiiError("invalid_input", `Table ${number} already exists at this venue.`, "tableNumberTaken");
}

/** Turns a race on the (venue, number) unique key into the same refusal as the check before it. */
async function uniqueTableNumbers<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new MaasiiError("invalid_input", "That table number already exists at this venue.", "tableNumberTaken");
    }
    throw error;
  }
}
