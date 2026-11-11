import { z } from "zod";
import { requireBrandOwner } from "./access";
import type { Actor } from "./actor";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";

// ---- Publishing --------------------------------------------------------------------------------

const dishInput = z.object({
  /** Omit for a new dish. Pass the id of a previously published dish to keep its identity. */
  dishId: z.uuid().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  priceSantim: z.number().int().nonnegative(),
});

const sectionInput = z.object({
  sectionId: z.uuid().optional(),
  name: z.string().trim().min(1),
  dishes: z.array(dishInput),
});

const menuInput = z.object({ sections: z.array(sectionInput) });

export type MenuInput = z.input<typeof menuInput>;

export type PublishedMenuVersion = {
  menuVersionId: string;
  number: number;
  publishedAt: Date;
  sections: { sectionId: string; name: string; dishes: { dishId: string; name: string }[] }[];
};

/**
 * Publishes `menu` as the Brand's new, immutable Menu version. Every Venue of the Brand shows it
 * from then on. Ticket 22 changes the source of the content from `menu` to the owner's draft.
 */
export async function publishMenu(
  actor: Actor,
  input: { brandId: string; menu: MenuInput },
  { now = new Date() }: { now?: Date } = {},
): Promise<PublishedMenuVersion> {
  const parsed = menuInput.safeParse(input.menu);
  if (!parsed.success) {
    throw new MaasiiError("invalid_input", `The Menu is not valid: ${z.prettifyError(parsed.error)}`);
  }
  const menu = parsed.data;

  return inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, input.brandId);
    const locked = await tx.query("select id from app.brands where id = $1 for update", [input.brandId]);
    if (locked.rowCount === 0) throw new MaasiiError("not_found", "Brand not found.");

    const sections = menu.sections.map((section) => ({
      ...section,
      sectionId: section.sectionId ?? crypto.randomUUID(),
      dishes: section.dishes.map((dish) => ({ ...dish, dishId: dish.dishId ?? crypto.randomUUID() })),
    }));
    const dishes = sections.flatMap((section) =>
      section.dishes.map((dish, position) => ({ ...dish, sectionId: section.sectionId, position })),
    );

    await ensureIdentities(tx, "menu_sections", input.brandId,
      menu.sections.map((s) => s.sectionId), sections.map((s) => s.sectionId));
    await ensureIdentities(tx, "dishes", input.brandId,
      menu.sections.flatMap((s) => s.dishes.map((d) => d.dishId)), dishes.map((d) => d.dishId));

    const { rows } = await tx.query<{ id: string; number: number; published_at: Date }>(
      `insert into app.menu_versions (brand_id, number, published_at, published_by)
       select $1, coalesce(max(number), 0) + 1, $2, $3 from app.menu_versions where brand_id = $1
       returning id, number, published_at`,
      [input.brandId, now, actor.kind === "staff" ? actor.userId : null],
    );
    const version = rows[0];

    await tx.query(
      `insert into app.menu_version_sections (menu_version_id, section_id, position, name_en)
       select $1, s.id, s.position, s.name
       from unnest($2::uuid[], $3::int[], $4::text[]) as s (id, position, name)`,
      [version.id, sections.map((s) => s.sectionId), sections.map((_, i) => i), sections.map((s) => s.name)],
    );
    await tx.query(
      `insert into app.menu_version_dishes
         (menu_version_id, dish_id, section_id, position, name_en, description_en, price_santim)
       select $1, d.id, d.section_id, d.position, d.name, d.description, d.price
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::text[], $7::int[])
         as d (id, section_id, position, name, description, price)`,
      [
        version.id,
        dishes.map((d) => d.dishId),
        dishes.map((d) => d.sectionId),
        dishes.map((d) => d.position),
        dishes.map((d) => d.name),
        dishes.map((d) => d.description),
        dishes.map((d) => d.priceSantim),
      ],
    );
    await tx.query("update app.brands set published_menu_version_id = $2 where id = $1", [
      input.brandId,
      version.id,
    ]);

    return {
      menuVersionId: version.id,
      number: version.number,
      publishedAt: version.published_at,
      sections: sections.map((s) => ({
        sectionId: s.sectionId,
        name: s.name,
        dishes: s.dishes.map((d) => ({ dishId: d.dishId, name: d.name })),
      })),
    };
  });
}

/**
 * Checks that every id the caller passed belongs to this Brand, then creates identities for the
 * new ones. `given` holds the caller's ids (undefined for new), `all` the final id of each entry.
 */
async function ensureIdentities(
  tx: Tx,
  table: "menu_sections" | "dishes",
  brandId: string,
  given: (string | undefined)[],
  all: string[],
): Promise<void> {
  if (new Set(all).size !== all.length) {
    throw new MaasiiError("invalid_input", `The Menu lists the same ${table === "dishes" ? "dish" : "section"} twice.`);
  }
  const existing = given.filter((id): id is string => id !== undefined);
  if (existing.length > 0) {
    const { rowCount } = await tx.query(
      `select 1 from app.${table} where brand_id = $1 and id = any($2::uuid[])`,
      [brandId, existing],
    );
    if (rowCount !== existing.length) {
      throw new MaasiiError("invalid_input", `The Menu refers to ${table === "dishes" ? "a dish" : "a section"} this Brand does not have.`);
    }
  }
  const fresh = all.filter((id) => !existing.includes(id));
  if (fresh.length > 0) {
    await tx.query(
      `insert into app.${table} (id, brand_id) select id, $1 from unnest($2::uuid[]) as id`,
      [brandId, fresh],
    );
  }
}

// ---- Reading -----------------------------------------------------------------------------------

export type GuestMenuDish = { id: string; name: string; description: string; priceSantim: number };
export type GuestMenuSection = { id: string; name: string; dishes: GuestMenuDish[] };
export type GuestMenu = {
  brand: { id: string; name: string; logoUrl: string | null };
  venue: { id: string; name: string; linkToken: string };
  /** Null until the Brand publishes its first Menu. */
  menuVersion: { id: string; number: number; publishedAt: Date } | null;
  sections: GuestMenuSection[];
};

/** What a guest sees after opening a Venue Link, or null when no Venue has that link. */
export async function getPublishedMenu(
  actor: Actor,
  input: { venueLinkToken: string },
): Promise<GuestMenu | null> {
  return inTransaction(actor, async (tx) => {
    const { rows } = await tx.query(
      `select v.id as venue_id, v.name as venue_name, v.link_token,
              b.id as brand_id, b.name as brand_name, b.logo_url,
              mv.id as version_id, mv.number as version_number, mv.published_at
       from app.venues v
       join app.brands b on b.id = v.brand_id
       left join app.menu_versions mv on mv.id = b.published_menu_version_id
       where v.link_token = $1`,
      [input.venueLinkToken],
    );
    const row = rows[0];
    if (!row) return null;

    const menu: GuestMenu = {
      brand: { id: row.brand_id, name: row.brand_name, logoUrl: row.logo_url },
      venue: { id: row.venue_id, name: row.venue_name, linkToken: row.link_token },
      menuVersion: row.version_id
        ? { id: row.version_id, number: row.version_number, publishedAt: row.published_at }
        : null,
      sections: [],
    };
    if (!row.version_id) return menu;

    const sections = await tx.query<{ id: string; name: string }>(
      `select section_id as id, name_en as name from app.menu_version_sections
       where menu_version_id = $1 order by position`,
      [row.version_id],
    );
    const dishes = await tx.query<GuestMenuDish & { sectionId: string }>(
      `select dish_id as id, section_id as "sectionId", name_en as name,
              description_en as description, price_santim as "priceSantim"
       from app.menu_version_dishes
       where menu_version_id = $1 order by position`,
      [row.version_id],
    );
    menu.sections = sections.rows.map((section) => ({
      ...section,
      dishes: dishes.rows
        .filter((dish) => dish.sectionId === section.id)
        .map(({ sectionId: _sectionId, ...dish }) => dish),
    }));
    return menu;
  });
}
