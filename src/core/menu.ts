import { z } from "zod";
import { requireBrandOwner } from "./access";
import type { Actor } from "./actor";
import { deriveBrandTheme } from "./brand-theme";
import type { Brand } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { bilingualInput, bilingualNameInput, inLanguage, languages, type Bilingual, type Language } from "./language";

// ---- Publishing --------------------------------------------------------------------------------

const choiceInput = z.object({
  /** Omit for a new choice. Pass a previously published choice's id so guests' Drafts still match it. */
  choiceId: z.uuid().optional(),
  name: bilingualNameInput,
  priceChangeSantim: z.number().int().nonnegative().default(0),
});

const optionGroupInput = z
  .object({
    optionGroupId: z.uuid().optional(),
    name: bilingualNameInput,
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
  name: bilingualNameInput,
  description: bilingualInput.default({ am: "", en: "" }),
  priceSantim: z.number().int().nonnegative(),
  fasting: z.boolean().default(false),
  photoUrl: z.string().trim().min(1).optional(),
  houseFavourite: z.boolean().default(false),
  optionGroups: z.array(optionGroupInput).default([]),
}).refine((dish) => !dish.houseFavourite || dish.photoUrl !== undefined, {
  message: "The House favourite needs a photo.",
});

const sectionInput = z.object({
  sectionId: z.uuid().optional(),
  name: bilingualNameInput,
  dishes: z.array(dishInput),
});

const menuInput = z.object({ sections: z.array(sectionInput) }).refine(
  (menu) => menu.sections.flatMap((section) => section.dishes).filter((dish) => dish.houseFavourite).length <= 1,
  { message: "The Menu can have only one House favourite." },
);

export type MenuInput = z.input<typeof menuInput>;
export type OptionGroupInput = z.input<typeof optionGroupInput>;

export type PublishedMenuVersion = {
  menuVersionId: string;
  number: number;
  publishedAt: Date;
  sections: {
    sectionId: string;
    name: Bilingual;
    dishes: {
      dishId: string;
      name: Bilingual;
      optionGroups: {
        optionGroupId: string;
        name: Bilingual;
        choices: { choiceId: string; name: Bilingual }[];
      }[];
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
      `insert into app.menu_version_sections (menu_version_id, section_id, position, name_en, name_am)
       select $1, s.id, s.position, s.name_en, s.name_am
       from unnest($2::uuid[], $3::int[], $4::text[], $5::text[]) as s (id, position, name_en, name_am)`,
      [
        version.id,
        sections.map((s) => s.sectionId),
        sections.map((_, i) => i),
        sections.map((s) => s.name.en),
        sections.map((s) => s.name.am),
      ],
    );
    await tx.query(
      `insert into app.menu_version_dishes
         (menu_version_id, dish_id, section_id, position,
          name_en, name_am, description_en, description_am, price_santim, fasting, photo_url, house_favourite)
       select $1, d.id, d.section_id, d.position, d.name_en, d.name_am, d.description_en, d.description_am,
              d.price, d.fasting, d.photo_url, d.house_favourite
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::text[], $7::text[], $8::text[],
                   $9::int[], $10::boolean[], $11::text[], $12::boolean[])
         as d (id, section_id, position, name_en, name_am, description_en, description_am, price, fasting, photo_url, house_favourite)`,
      [
        version.id,
        dishes.map((d) => d.dishId),
        dishes.map((d) => d.sectionId),
        dishes.map((d) => d.position),
        dishes.map((d) => d.name.en),
        dishes.map((d) => d.name.am),
        dishes.map((d) => d.description.en),
        dishes.map((d) => d.description.am),
        dishes.map((d) => d.priceSantim),
        dishes.map((d) => d.fasting),
        dishes.map((d) => d.photoUrl ?? null),
        dishes.map((d) => d.houseFavourite),
      ],
    );
    await tx.query(
      `insert into app.menu_version_option_groups
         (menu_version_id, option_group_id, dish_id, position, kind, required, name_en, name_am)
       select $1, g.id, g.dish_id, g.position, g.kind, g.required, g.name_en, g.name_am
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::boolean[], $7::text[], $8::text[])
         as g (id, dish_id, position, kind, required, name_en, name_am)`,
      [
        version.id,
        optionGroups.map((g) => g.optionGroupId),
        optionGroups.map((g) => g.dishId),
        optionGroups.map((g) => g.position),
        optionGroups.map((g) => g.kind),
        optionGroups.map((g) => g.required),
        optionGroups.map((g) => g.name.en),
        optionGroups.map((g) => g.name.am),
      ],
    );
    await tx.query(
      `insert into app.menu_version_option_choices
         (menu_version_id, choice_id, option_group_id, position, name_en, name_am, price_change_santim)
       select $1, c.id, c.option_group_id, c.position, c.name_en, c.name_am, c.price_change
       from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::text[], $7::int[])
         as c (id, option_group_id, position, name_en, name_am, price_change)`,
      [
        version.id,
        choices.map((c) => c.choiceId),
        choices.map((c) => c.optionGroupId),
        choices.map((c) => c.position),
        choices.map((c) => c.name.en),
        choices.map((c) => c.name.am),
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
  brand: Brand;
  theme: ReturnType<typeof deriveBrandTheme>;
  venue: { id: string; name: string; linkToken: string };
  /** Null until the Brand publishes its first Menu. */
  menuVersion: { id: string; number: number; publishedAt: Date } | null;
  sections: GuestMenuSection[];
  /** The dishes to feature today, in Menu order. Empty when today is a non-fasting day. */
  fastingDishes: GuestMenuDish[];
  houseFavourite: GuestMenuDish | null;
};

/**
 * What a guest sees after opening a Venue Link, or null when no Venue has that link. Menu text
 * is in `language` (English by default), falling back to the other language where text is missing.
 */
export async function getPublishedMenu(
  actor: Actor,
  input: { venueLinkToken: string; language?: Language },
  { now = new Date() }: { now?: Date } = {},
): Promise<GuestMenu | null> {
  return inTransaction(actor, async (tx) => (await readPublishedMenu(tx, input, now))?.menu ?? null);
}

type LocalizedRow = { id: string; name_en: string; name_am: string };
type DishRow = LocalizedRow & {
  section_id: string;
  description_en: string;
  description_am: string;
  price_santim: number;
  fasting: boolean;
  photo_url: string | null;
  house_favourite: boolean;
};
type GroupRow = LocalizedRow & { dish_id: string; kind: GuestOptionGroup["kind"]; required: boolean };
type ChoiceRow = LocalizedRow & { option_group_id: string; price_change_santim: number };

export async function readPublishedMenu(
  tx: Tx,
  input: { venueLinkToken: string; language?: Language },
  now: Date,
) {
  const language = z.enum(languages).default("en").safeParse(input.language);
  if (!language.success) throw new MaasiiError("invalid_input", "The Menu is only available in Amharic and English.");
  const text = (en: string, am: string) => inLanguage({ en, am }, language.data);

  // One statement snapshots the published version and current Venue prices and availability together.
  const { rows: [row] } = await tx.query<{
    venue_id: string;
    venue_name: string;
    link_token: string;
    brand_id: string;
    brand_name: string;
    logo_url: string | null;
    colour: string;
    cover_url: string | null;
    display_font: Brand["displayFont"];
    sections: LocalizedRow[];
    dishes: DishRow[];
    groups: GroupRow[];
    choices: ChoiceRow[];
  } & (
    | { version_id: string; version_number: number; published_at: Date }
    | { version_id: null; version_number: null; published_at: null }
  )>(
    `select v.id as venue_id, v.name as venue_name, v.link_token,
            b.id as brand_id, b.name as brand_name, b.logo_url, b.colour, b.cover_url, b.display_font,
            mv.id as version_id, mv.number as version_number, mv.published_at,
            (select coalesce(jsonb_agg(s order by position), '[]') from (
              select section_id as id, name_en, name_am, position from app.menu_version_sections
              where menu_version_id = mv.id
            ) s) as sections,
            (select coalesce(jsonb_agg(d order by position), '[]') from (
              select d.dish_id as id, d.section_id, d.name_en, d.name_am, d.description_en, d.description_am,
                     coalesce(settings.price_santim, d.price_santim) as price_santim,
                     d.fasting, d.photo_url, d.house_favourite, d.position
              from app.menu_version_dishes d
              left join app.venue_dish_settings settings on settings.venue_id = v.id and settings.dish_id = d.dish_id
              where d.menu_version_id = mv.id and settings.sold_out is not true
            ) d) as dishes,
            (select coalesce(jsonb_agg(g order by position), '[]') from (
              select option_group_id as id, dish_id, name_en, name_am, kind, required, position
              from app.menu_version_option_groups where menu_version_id = mv.id
            ) g) as groups,
            (select coalesce(jsonb_agg(c order by position), '[]') from (
              select choice_id as id, option_group_id, name_en, name_am, price_change_santim, position
              from app.menu_version_option_choices where menu_version_id = mv.id
            ) c) as choices
     from app.venues v
     join app.brands b on b.id = v.brand_id
     left join app.menu_versions mv on mv.id = b.published_menu_version_id
     where v.link_token = $1`,
    [input.venueLinkToken],
  );
  if (!row) return null;

  const optionGroupsOf = (dishId: string): GuestOptionGroup[] =>
    row.groups
      .filter((group) => group.dish_id === dishId)
      .map((group) => ({
        id: group.id,
        name: text(group.name_en, group.name_am),
        kind: group.kind,
        required: group.required,
        choices: row.choices
          .filter((choice) => choice.option_group_id === group.id)
          .map((choice) => ({
            id: choice.id,
            name: text(choice.name_en, choice.name_am),
            priceChangeSantim: choice.price_change_santim,
          })),
      }));
  const sections = row.sections.map((section) => ({
    id: section.id,
    name: text(section.name_en, section.name_am),
    dishes: row.dishes
      .filter((dish) => dish.section_id === section.id)
      .map((dish) => ({
        id: dish.id,
        name: text(dish.name_en, dish.name_am),
        description: text(dish.description_en, dish.description_am),
        priceSantim: dish.price_santim,
        fasting: dish.fasting,
        photoUrl: dish.photo_url,
        optionGroups: optionGroupsOf(dish.id),
      })),
  }));
  const guestDishes = sections.flatMap((section) => section.dishes);
  const favouriteId = row.dishes.find((dish) => dish.house_favourite)?.id;
  const fastingDishes = guestDishes.filter((dish) => dish.fasting);
  const menu: GuestMenu = {
    brand: {
      id: row.brand_id,
      name: row.brand_name,
      logoUrl: row.logo_url,
      colour: row.colour,
      coverUrl: row.cover_url,
      displayFont: row.display_font,
    },
    theme: deriveBrandTheme(row.colour),
    venue: { id: row.venue_id, name: row.venue_name, linkToken: row.link_token },
    menuVersion: row.version_id === null
      ? null
      : { id: row.version_id, number: row.version_number, publishedAt: row.published_at },
    sections,
    houseFavourite: guestDishes.find((dish) => dish.id === favouriteId) ?? null,
    fastingDishes: fastingDishes.length > 0 && await isFastingDay(tx, now) ? fastingDishes : [],
  };
  return { menu, dishes: row.dishes, choices: row.choices };
}

async function isFastingDay(tx: Tx, now: Date): Promise<boolean> {
  // A non-fasting exception wins if dated periods overlap.
  const { rows } = await tx.query<{ fasting: boolean }>(
    `select coalesce(
       (select bool_and(fasting) from app.fasting_calendar_periods where local.day between starts_on and ends_on),
       extract(isodow from local.day) in (3, 5)
     ) as fasting
     from (select ($1::timestamptz at time zone 'Africa/Addis_Ababa')::date as day) as local`,
    [now],
  );
  return rows[0].fasting;
}
