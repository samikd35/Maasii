import { z } from "zod";
import { requireBrandOwner } from "./access";
import type { Actor } from "./actor";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";

// ---- Publishing --------------------------------------------------------------------------------

const choiceInput = z.object({
  /** Omit for a new choice. Pass a previously published choice's id so guests' Drafts still match it. */
  choiceId: z.uuid().optional(),
  name: z.string().trim().min(1),
  priceChangeSantim: z.number().int().nonnegative().default(0),
});

const optionGroupInput = z
  .object({
    optionGroupId: z.uuid().optional(),
    name: z.string().trim().min(1),
    kind: z.enum(["choose_one", "add_extras"]),
    /** Only a "choose one" group can be required. */
    required: z.boolean().default(false),
    choices: z.array(choiceInput).min(1),
  })
  .refine((group) => !group.required || group.kind === "choose_one", {
    message: 'Only a "choose one" Option Group can be required.',
  });

const dishInput = z.object({
  /** Omit for a new dish. Pass the id of a previously published dish to keep its identity. */
  dishId: z.uuid().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  priceSantim: z.number().int().nonnegative(),
  fasting: z.boolean().default(false),
  photoUrl: z.string().trim().min(1).optional(),
  optionGroups: z.array(optionGroupInput).default([]),
});

const sectionInput = z.object({
  sectionId: z.uuid().optional(),
  name: z.string().trim().min(1),
  dishes: z.array(dishInput),
});

const menuInput = z.object({ sections: z.array(sectionInput) });

export type MenuInput = z.input<typeof menuInput>;
export type OptionGroupInput = z.input<typeof optionGroupInput>;

export type PublishedMenuVersion = {
  menuVersionId: string;
  number: number;
  publishedAt: Date;
  sections: {
    sectionId: string;
    name: string;
    dishes: {
      dishId: string;
      name: string;
      optionGroups: { optionGroupId: string; name: string; choices: { choiceId: string; name: string }[] }[];
    }[];
  }[];
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
      dishes: section.dishes.map((dish) => ({
        ...dish,
        dishId: dish.dishId ?? crypto.randomUUID(),
        optionGroups: dish.optionGroups.map((group) => ({
          ...group,
          optionGroupId: group.optionGroupId ?? crypto.randomUUID(),
          choices: group.choices.map((choice) => ({ ...choice, choiceId: choice.choiceId ?? crypto.randomUUID() })),
        })),
      })),
    }));
    const dishes = sections.flatMap((section) =>
      section.dishes.map((dish, position) => ({ ...dish, sectionId: section.sectionId, position })),
    );
    const optionGroups = dishes.flatMap((dish) =>
      dish.optionGroups.map((group, position) => ({ ...group, dishId: dish.dishId, position })),
    );
    const choices = optionGroups.flatMap((group) =>
      group.choices.map((choice, position) => ({ ...choice, optionGroupId: group.optionGroupId, position })),
    );
    if (new Set(optionGroups.map((g) => g.optionGroupId)).size !== optionGroups.length) {
      throw new MaasiiError("invalid_input", "The Menu lists the same Option Group twice.");
    }
    if (new Set(choices.map((c) => c.choiceId)).size !== choices.length) {
      throw new MaasiiError("invalid_input", "The Menu lists the same Option Group choice twice.");
    }

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
         (menu_version_id, dish_id, section_id, position, name_en, description_en, price_santim, fasting, photo_url)
       select $1, d.id, d.section_id, d.position, d.name, d.description, d.price, d.fasting, d.photo_url
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::text[], $7::int[], $8::boolean[], $9::text[])
         as d (id, section_id, position, name, description, price, fasting, photo_url)`,
      [
        version.id,
        dishes.map((d) => d.dishId),
        dishes.map((d) => d.sectionId),
        dishes.map((d) => d.position),
        dishes.map((d) => d.name),
        dishes.map((d) => d.description),
        dishes.map((d) => d.priceSantim),
        dishes.map((d) => d.fasting),
        dishes.map((d) => d.photoUrl ?? null),
      ],
    );
    await tx.query(
      `insert into app.menu_version_option_groups
         (menu_version_id, option_group_id, dish_id, position, kind, required, name_en)
       select $1, g.id, g.dish_id, g.position, g.kind, g.required, g.name
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::boolean[], $7::text[])
         as g (id, dish_id, position, kind, required, name)`,
      [
        version.id,
        optionGroups.map((g) => g.optionGroupId),
        optionGroups.map((g) => g.dishId),
        optionGroups.map((g) => g.position),
        optionGroups.map((g) => g.kind),
        optionGroups.map((g) => g.required),
        optionGroups.map((g) => g.name),
      ],
    );
    await tx.query(
      `insert into app.menu_version_option_choices
         (menu_version_id, choice_id, option_group_id, position, name_en, price_change_santim)
       select $1, c.id, c.option_group_id, c.position, c.name, c.price_change
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::int[])
         as c (id, option_group_id, position, name, price_change)`,
      [
        version.id,
        choices.map((c) => c.choiceId),
        choices.map((c) => c.optionGroupId),
        choices.map((c) => c.position),
        choices.map((c) => c.name),
        choices.map((c) => c.priceChangeSantim),
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
        dishes: s.dishes.map((d) => ({
          dishId: d.dishId,
          name: d.name,
          optionGroups: d.optionGroups.map((g) => ({
            optionGroupId: g.optionGroupId,
            name: g.name,
            choices: g.choices.map((c) => ({ choiceId: c.choiceId, name: c.name })),
          })),
        })),
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

export type GuestOptionChoice = { id: string; name: string; priceChangeSantim: number };
export type GuestOptionGroup = {
  id: string;
  name: string;
  kind: "choose_one" | "add_extras";
  /** Only "choose one" groups can be required. */
  required: boolean;
  choices: GuestOptionChoice[];
};
export type GuestMenuDish = {
  id: string;
  name: string;
  description: string;
  priceSantim: number;
  fasting: boolean;
  photoUrl: string | null;
  optionGroups: GuestOptionGroup[];
};
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
    const dishes = await tx.query<Omit<GuestMenuDish, "optionGroups"> & { sectionId: string }>(
      `select dish_id as id, section_id as "sectionId", name_en as name,
              description_en as description, price_santim as "priceSantim",
              fasting, photo_url as "photoUrl"
       from app.menu_version_dishes
       where menu_version_id = $1 order by position`,
      [row.version_id],
    );
    const groups = await tx.query<Omit<GuestOptionGroup, "choices"> & { dishId: string }>(
      `select option_group_id as id, dish_id as "dishId", name_en as name, kind, required
       from app.menu_version_option_groups
       where menu_version_id = $1 order by position`,
      [row.version_id],
    );
    const choices = await tx.query<GuestOptionChoice & { optionGroupId: string }>(
      `select choice_id as id, option_group_id as "optionGroupId", name_en as name,
              price_change_santim as "priceChangeSantim"
       from app.menu_version_option_choices
       where menu_version_id = $1 order by position`,
      [row.version_id],
    );
    const optionGroupsOf = (dishId: string): GuestOptionGroup[] =>
      groups.rows
        .filter((group) => group.dishId === dishId)
        .map((group) => ({
          id: group.id,
          name: group.name,
          kind: group.kind,
          required: group.required,
          choices: choices.rows
            .filter((choice) => choice.optionGroupId === group.id)
            .map((choice) => ({ id: choice.id, name: choice.name, priceChangeSantim: choice.priceChangeSantim })),
        }));
    menu.sections = sections.rows.map((section) => ({
      ...section,
      dishes: dishes.rows
        .filter((dish) => dish.sectionId === section.id)
        .map((dish) => ({
          id: dish.id,
          name: dish.name,
          description: dish.description,
          priceSantim: dish.priceSantim,
          fasting: dish.fasting,
          photoUrl: dish.photoUrl,
          optionGroups: optionGroupsOf(dish.id),
        })),
    }));
    return menu;
  });
}
