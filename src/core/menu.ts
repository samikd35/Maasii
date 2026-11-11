import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { requireBrandOwner } from "./access";
import type { Actor } from "./actor";
import { brandArtworkBucket, prepareBrandArtwork, uploadBrandArtwork } from "./brand-artwork";
import { deriveBrandTheme } from "./brand-theme";
import type { Brand } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { extractedMenu, missingMenuTranslation, runMenuDraftModel, translatedFields } from "./menu-ai";
import { localizeMenuSections } from "./menu-display";
import { parseInput } from "./validation";
import { languages, type Bilingual, type Language } from "./language";

// ---- Publishing --------------------------------------------------------------------------------

const text = z.string().trim().default("");

// Accept plain English text from existing Menu callers.
const bilingualInput = z.union([
  z.object({ am: text, en: text }),
  z.string().trim().transform((en) => ({ en, am: "" })),
]);

const bilingualNameInput = bilingualInput.refine((name) => name.am !== "" || name.en !== "", {
  message: "Give a name in Amharic or English.",
});

const santim = z.int().min(0).max(2_147_483_647);

const draftChoiceInput = z.object({
  /** Omit for a new choice. Pass a previously published choice's id so guests' Drafts still match it. */
  choiceId: z.uuid().optional(),
  name: bilingualInput,
  priceChangeSantim: santim.default(0),
});

const draftOptionGroupInput = z
  .object({
    optionGroupId: z.uuid().optional(),
    name: bilingualInput,
    kind: z.enum(["choose_one", "add_extras"]),
    /** Only a "choose one" group can be required. */
    required: z.boolean().default(false),
    choices: z.array(draftChoiceInput),
  })
  .refine((group) => !group.required || group.kind === "choose_one", {
    message: 'Only a "choose one" Option Group can be required.',
  });

const optionGroupInput = draftOptionGroupInput.safeExtend({
  name: bilingualNameInput,
  choices: z.array(draftChoiceInput.extend({ name: bilingualNameInput })).min(1),
});

const draftDishInput = z.object({
  /** Omit for a new dish. Pass the id of a previously published dish to keep its identity. */
  dishId: z.uuid().optional(),
  imported: z.enum(["review", "missing_price"]).optional(),
  suggestedName: z.enum(languages).optional(),
  suggestedDescription: z.enum(languages).optional(),
  name: bilingualInput,
  description: bilingualInput.default({ am: "", en: "" }),
  priceSantim: santim,
  fasting: z.boolean().default(false),
  photoUrl: z.string().trim().min(1).optional(),
  houseFavourite: z.boolean().default(false),
  optionGroups: z.array(draftOptionGroupInput).default([]),
});

const dishInput = draftDishInput.omit({ imported: true, suggestedName: true, suggestedDescription: true })
  .extend({ name: bilingualNameInput, optionGroups: z.array(optionGroupInput).default([]) })
  .refine((dish) => !dish.houseFavourite || dish.photoUrl !== undefined, { message: "The House favourite needs a photo." });

const sectionInput = z.object({
  sectionId: z.uuid().optional(),
  name: bilingualNameInput,
  dishes: z.array(dishInput),
});

const menuInput = z.object({ sections: z.array(sectionInput) }).refine(
  (menu) => menu.sections.flatMap((section) => section.dishes).filter((dish) => dish.houseFavourite).length <= 1,
  { message: "The Menu can have only one House favourite." },
);

const draftSectionInput = sectionInput.extend({
  name: bilingualInput,
  dishes: z.array(draftDishInput),
  imported: z.literal(true).optional(),
  suggestedName: z.enum(languages).optional(),
});

const draftMenuInput = z.object({
  sections: z.array(draftSectionInput),
  archivedDishes: z.array(z.object({ sectionId: z.uuid(), sectionName: bilingualInput, dish: draftDishInput })).optional(),
});

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

/** Publishes a complete Menu supplied by the caller, for seeding and imports. */
export async function publishMenu(
  actor: Actor,
  input: { brandId: string; menu: MenuInput },
  { now = new Date() }: { now?: Date } = {},
): Promise<PublishedMenuVersion> {
  const menu = parseInput(menuInput, input.menu);
  const existingDishIds = menu.sections.flatMap((section) => section.dishes)
    .map((dish) => dish.dishId)
    .filter((dishId) => dishId !== undefined);
  return inTransaction(actor, async (tx) => {
    await lockBrand(tx, actor, input.brandId);
    if (existingDishIds.length > 0) {
      const { rows } = await tx.query(
        `select 1 from app.brand_menu_drafts d
         cross join lateral jsonb_array_elements(d.published_archive) as entry
         where d.brand_id = $1 and (entry->'dish'->>'dishId')::uuid = any($2::uuid[])
         limit 1`,
        [input.brandId, existingDishIds],
      );
      if (rows.length > 0) {
        throw new MaasiiError("invalid_input", "Restore archived Dishes in the Menu draft before publishing them.");
      }
    }
    return writeMenuVersion(tx, actor, input.brandId, assignIdentities(menu), now, menu);
  });
}

async function lockBrand(tx: Tx, actor: Actor, brandId: string) {
  await requireBrandOwner(tx, actor, brandId);
  const locked = await tx.query("select id from app.brands where id = $1 for update", [brandId]);
  if (locked.rowCount === 0) throw new MaasiiError("not_found", "Brand not found.");
}

function assignDishIdentities(dish: z.output<typeof draftDishInput>) {
  return {
    ...dish,
    dishId: dish.dishId ?? crypto.randomUUID(),
    optionGroups: dish.optionGroups.map((group) => ({
      ...group,
      optionGroupId: group.optionGroupId ?? crypto.randomUUID(),
      choices: group.choices.map((choice) => ({ ...choice, choiceId: choice.choiceId ?? crypto.randomUUID() })),
    })),
  };
}

function assignIdentities(menu: z.output<typeof draftMenuInput>): MenuDraftContent {
  return {
    sections: menu.sections.map((section) => ({
      ...section,
      sectionId: section.sectionId ?? crypto.randomUUID(),
      dishes: section.dishes.map(assignDishIdentities),
    })),
    archivedDishes: (menu.archivedDishes ?? []).map((entry) => ({ ...entry, dish: assignDishIdentities(entry.dish) })),
  };
}

type DraftDish = ReturnType<typeof assignDishIdentities>;
export type MenuDraftContent = {
  sections: (Omit<z.output<typeof draftSectionInput>, "sectionId" | "dishes"> & { sectionId: string; dishes: DraftDish[] })[];
  archivedDishes: { sectionId: string; sectionName: Bilingual; dish: DraftDish }[];
};

type DraftMenuInput = z.input<typeof draftMenuInput>;

async function writeMenuVersion(
  tx: Tx,
  actor: Actor,
  brandId: string,
  { sections }: MenuDraftContent,
  now: Date,
  importedMenu?: z.output<typeof menuInput>,
): Promise<PublishedMenuVersion> {
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

  await ensureIdentities(tx, "menu_sections", brandId, sections.map((s) => s.sectionId),
    importedMenu?.sections.map((s) => s.sectionId));
  await ensureIdentities(tx, "dishes", brandId, dishes.map((d) => d.dishId),
    importedMenu?.sections.flatMap((s) => s.dishes.map((d) => d.dishId)));

  const { rows } = await tx.query<{ id: string; number: number; published_at: Date }>(
    `insert into app.menu_versions (brand_id, number, published_at, published_by)
     select $1, coalesce(max(number), 0) + 1, $2, $3 from app.menu_versions where brand_id = $1
     returning id, number, published_at`,
    [brandId, now, actor.kind === "staff" ? actor.userId : null],
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
    brandId,
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
}

/** A draft carries newly assigned ids. Direct publishers may only supply existing ids. */
async function ensureIdentities(
  tx: Tx,
  table: "menu_sections" | "dishes",
  brandId: string,
  ids: string[],
  importedIds?: (string | undefined)[],
): Promise<void> {
  const kind = table === "dishes" ? "dish" : "section";
  if (new Set(ids).size !== ids.length) {
    throw new MaasiiError("invalid_input", `The Menu lists the same ${kind} twice.`);
  }
  if (ids.length === 0) return;
  const fresh = ids.filter((_, i) => !importedIds?.[i]);
  if (fresh.length > 0) {
    await tx.query(
      `insert into app.${table} (id, brand_id) select id, $1 from unnest($2::uuid[]) as id
       on conflict (id) do nothing`,
      [brandId, fresh],
    );
  }
  const { rowCount } = await tx.query(
    `select 1 from app.${table} where brand_id = $1 and id = any($2::uuid[])`,
    [brandId, ids],
  );
  if (rowCount !== ids.length) {
    throw new MaasiiError("invalid_input", `The Menu refers to a ${kind} this Brand does not have.`);
  }
}

// ---- Owner's Menu draft ------------------------------------------------------------------------

/** Store validated artwork before the Owner attaches its URL to a draft Dish. */
export async function uploadDishPhoto(actor: Actor, input: { brandId: string; photo: File }): Promise<string> {
  const { brandId, photo } = parseInput(z.object({ brandId: z.uuid(), photo: z.file() }), input);
  await inTransaction(actor, (tx) => requireBrandOwner(tx, actor, brandId));
  const bytes = await prepareBrandArtwork(photo, 960, 960);
  // ponytail: immutable URLs preserve old Menu versions. Prune unreferenced uploads if storage grows.
  return uploadBrandArtwork(brandArtworkBucket(), `${brandId}/dish-${crypto.randomUUID()}.webp`, bytes);
}

type MenuDraftContext = {
  brand: Brand;
  venueName: string | null;
  versionId: string | null;
  lastPublishedAt: Date | null;
  draftRevision: string | null;
  draftContent: (Pick<MenuDraftContent, "sections"> & Partial<Pick<MenuDraftContent, "archivedDishes">>) | null;
  publishedArchive: MenuDraftContent["archivedDishes"];
};

export type MenuDraft = {
  brand: Brand;
  venueName: string | null;
  menu: MenuDraftContent;
  revision: string | null;
  hasUnpublishedChanges: boolean;
  lastPublishedAt: Date | null;
  fastingDay: boolean;
};

async function readDraftContext(tx: Tx, brandId: string): Promise<MenuDraftContext> {
  const { rows } = await tx.query<MenuDraftContext>(
    `select jsonb_build_object('id', b.id, 'name', b.name, 'logoUrl', b.logo_url, 'colour', b.colour,
              'coverUrl', b.cover_url, 'displayFont', b.display_font) as brand,
            (select name from app.venues where brand_id = b.id order by created_at, id limit 1) as "venueName",
            b.published_menu_version_id as "versionId", v.published_at as "lastPublishedAt",
            d.revision as "draftRevision", d.content as "draftContent",
            coalesce(d.published_archive, '[]') as "publishedArchive"
     from app.brands b
     left join app.menu_versions v on v.id = b.published_menu_version_id
     left join app.brand_menu_drafts d on d.brand_id = b.id
     where b.id = $1`,
    [brandId],
  );
  if (!rows[0]) throw new MaasiiError("not_found", "Brand not found.");
  return rows[0];
}

async function readBrandMenu(tx: Tx, context: MenuDraftContext): Promise<MenuDraftContent> {
  return {
    sections: context.versionId ? await readMenuSections(tx, context.versionId, null) : [],
    archivedDishes: context.publishedArchive,
  };
}

function savedDraft(context: MenuDraftContext): MenuDraftContent | null {
  if (!context.draftContent) return null;
  return { ...context.draftContent, archivedDishes: context.draftContent.archivedDishes ?? context.publishedArchive };
}

export async function getMenuDraft(
  actor: Actor,
  input: { brandId: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<MenuDraft> {
  const { brandId } = parseInput(z.object({ brandId: z.uuid() }), input);
  return inTransaction(actor, async (tx) => {
    await requireBrandOwner(tx, actor, brandId);
    const context = await readDraftContext(tx, brandId);
    const { brand, venueName, versionId, lastPublishedAt, draftRevision } = context;
    return {
      brand,
      venueName,
      lastPublishedAt,
      menu: savedDraft(context) ?? await readBrandMenu(tx, context),
      revision: draftRevision ?? versionId,
      hasUnpublishedChanges: draftRevision !== null,
      fastingDay: await isFastingDay(tx, now),
    };
  });
}

const draftEditInput = z.object({ brandId: z.uuid(), revision: z.uuid().nullable(), menu: draftMenuInput.optional() });

function menuDraftChanged() {
  return new MaasiiError("invalid_input", "The Menu changed since it was opened. Reload it to see the latest changes.", "menuDraftChanged");
}

function checkDraftRevision(context: MenuDraftContext, revision: string | null) {
  if ((context.draftRevision ?? context.versionId) !== revision) throw menuDraftChanged();
}

export const MAX_MENU_IMPORT_PHOTOS = 2;

export async function importMenuPhotos(
  actor: Actor,
  input: { brandId: string; revision: string | null; menu?: DraftMenuInput; photos: File[] },
  options: Parameters<typeof runMenuDraftModel>[2] = {},
): Promise<void> {
  const { brandId, revision, menu, photos } = parseInput(
    draftEditInput.extend({ photos: z.array(z.file()).min(1).max(MAX_MENU_IMPORT_PHOTOS) }), input, "menuAiPhotos",
  );
  const draft = await getMenuDraft(actor, { brandId });
  if (draft.revision !== revision) throw menuDraftChanged();
  const prepared = await Promise.all(photos.map((photo) => prepareBrandArtwork(photo, 2048, 2048)));
  const extracted = await runMenuDraftModel({ kind: "import", photos: prepared }, extractedMenu, options);
  if (extracted.sections.length === 0) {
    throw new MaasiiError("invalid_input", "No readable dishes were found in these photos.", "menuAiNoDishes");
  }
  const current = menu ?? draft.menu;
  const additions: DraftMenuInput["sections"] = extracted.sections.map((section) => ({
    ...section,
    imported: true,
    dishes: section.dishes.map((dish) => ({
      ...dish,
      imported: dish.priceSantim === null ? "missing_price" : "review",
      priceSantim: dish.priceSantim ?? 0,
    })),
  }));
  await saveMenuDraft(actor, {
    brandId, revision, menu: { ...current, sections: [...current.sections, ...additions] },
  });
}

export async function suggestMenuTranslations(
  actor: Actor,
  input: { brandId: string; revision: string | null; menu?: DraftMenuInput; sectionId: string; dishId?: string },
  options: Parameters<typeof runMenuDraftModel>[2] = {},
): Promise<void> {
  const { brandId, revision, menu, sectionId, dishId } = parseInput(
    draftEditInput.extend({ sectionId: z.uuid(), dishId: z.uuid().optional() }), input,
  );
  const draft = await getMenuDraft(actor, { brandId });
  if (draft.revision !== revision) throw menuDraftChanged();
  const current = menu ?? draft.menu;
  const section = current.sections.find((candidate) => candidate.sectionId === sectionId);
  const dish = dishId ? section?.dishes.find((candidate) => candidate.dishId === dishId) : undefined;
  if (!section || (dishId && !dish)) throw new MaasiiError("not_found", "Menu entry not found.");

  const entry = dish ?? section;
  const fields = missingMenuTranslation("name", entry.name);
  if (dish) fields.push(...missingMenuTranslation("description", dish.description));
  if (fields.length === 0) {
    throw new MaasiiError("invalid_input", "There is no missing language to suggest for this entry.", "menuAiText");
  }
  const suggestions = await runMenuDraftModel({ kind: "translate", fields }, translatedFields.refine(
    (result) => (["name", "description"] as const).every((field) =>
      (result[field] !== null) === fields.some((request) => request.field === field)),
  ), options);
  for (const { field, to } of fields) {
    if (field === "name" && suggestions.name) {
      entry.name[to] = suggestions.name;
      entry.suggestedName = to;
    }
    if (field === "description" && dish && suggestions.description) {
      dish.description[to] = suggestions.description;
      dish.suggestedDescription = to;
    }
  }
  await saveMenuDraft(actor, { brandId, revision, menu: current });
}

export async function saveMenuDraft(
  actor: Actor,
  input: { brandId: string; revision: string | null; menu: DraftMenuInput },
): Promise<string | null> {
  const { brandId, revision, menu } = parseInput(draftEditInput.required({ menu: true }), input);
  return inTransaction(actor, async (tx) => {
    await lockBrand(tx, actor, brandId);
    const context = await readDraftContext(tx, brandId);
    checkDraftRevision(context, revision);
    const existing = savedDraft(context);
    const content = assignIdentities({ ...menu, archivedDishes: menu.archivedDishes ?? existing?.archivedDishes ?? context.publishedArchive });
    checkArchive(content);
    if (isDeepStrictEqual(content, await readBrandMenu(tx, context))) {
      await tx.query("update app.brand_menu_drafts set revision = null, content = null where brand_id = $1", [brandId]);
      return context.versionId;
    }
    if (isDeepStrictEqual(content, existing)) return revision;
    const nextRevision = crypto.randomUUID();
    await tx.query(
      `insert into app.brand_menu_drafts (brand_id, revision, content) values ($1, $2, $3)
       on conflict (brand_id) do update set revision = excluded.revision, content = excluded.content`,
      [brandId, nextRevision, content],
    );
    return nextRevision;
  });
}

function checkArchive({ sections, archivedDishes }: MenuDraftContent) {
  const ids = sections.flatMap((section) => section.dishes.map((dish) => dish.dishId));
  for (const { dish } of archivedDishes) ids.push(dish.dishId);
  if (new Set(ids).size !== ids.length) {
    throw new MaasiiError("invalid_input", "The Menu lists the same Dish twice.");
  }
}

/** Publishes the saved draft, or publishes the editor's current edits in the same transaction. */
export async function publishMenuDraft(
  actor: Actor,
  input: { brandId: string; revision: string | null; menu?: DraftMenuInput },
  { now = new Date() }: { now?: Date } = {},
): Promise<PublishedMenuVersion> {
  const { brandId, revision, menu } = parseInput(draftEditInput, input);
  return inTransaction(actor, async (tx) => {
    await lockBrand(tx, actor, brandId);
    const context = await readDraftContext(tx, brandId);
    checkDraftRevision(context, revision);
    const existing = savedDraft(context);
    const content = menu ?? existing ?? await readBrandMenu(tx, context);
    if (content.sections.some((section) => section.imported || section.suggestedName || section.dishes.some(
      (dish) => dish.imported || dish.suggestedName || dish.suggestedDescription,
    ))) {
      throw new MaasiiError("invalid_input", "Review imported entries and suggested translations before publishing.", "menuAiReview");
    }
    const ready = assignIdentities({
      ...parseInput(menuInput, content, "menuDraftInvalid"),
      archivedDishes: content.archivedDishes ?? existing?.archivedDishes ?? context.publishedArchive,
    });
    checkArchive(ready);
    const published = await writeMenuVersion(tx, actor, brandId, ready, now);
    await tx.query(
      `insert into app.brand_menu_drafts (brand_id, published_archive) values ($1, $2)
       on conflict (brand_id) do update set published_archive = excluded.published_archive, revision = null, content = null`,
      [brandId, JSON.stringify(ready.archivedDishes)],
    );
    return published;
  });
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

type MenuRows = { sections: LocalizedRow[]; dishes: DishRow[]; groups: GroupRow[]; choices: ChoiceRow[] };

// Both the guest snapshot and the Owner's Brand Menu read the same version content.
const menuContentColumns = `
  (select coalesce(jsonb_agg(s order by position), '[]') from (
    select section_id as id, name_en, name_am, position from app.menu_version_sections
    where menu_version_id = scope.menu_version_id
  ) s) as sections,
  (select coalesce(jsonb_agg(d order by position), '[]') from (
    select d.dish_id as id, d.section_id, d.name_en, d.name_am, d.description_en, d.description_am,
           coalesce(settings.price_santim, d.price_santim) as price_santim,
           d.fasting, d.photo_url, d.house_favourite, d.position
    from app.menu_version_dishes d
    left join app.venue_dish_settings settings on settings.venue_id = scope.venue_id and settings.dish_id = d.dish_id
    where d.menu_version_id = scope.menu_version_id and settings.sold_out is not true
  ) d) as dishes,
  (select coalesce(jsonb_agg(g order by position), '[]') from (
    select option_group_id as id, dish_id, name_en, name_am, kind, required, position
    from app.menu_version_option_groups where menu_version_id = scope.menu_version_id
  ) g) as groups,
  (select coalesce(jsonb_agg(c order by position), '[]') from (
    select choice_id as id, option_group_id, name_en, name_am, price_change_santim, position
    from app.menu_version_option_choices where menu_version_id = scope.menu_version_id
  ) c) as choices
`;

export async function readPublishedMenu(
  tx: Tx,
  input: { venueLinkToken: string; language?: Language },
  now: Date,
) {
  const language = z.enum(languages).default("en").safeParse(input.language);
  if (!language.success) throw new MaasiiError("invalid_input", "The Menu is only available in Amharic and English.");

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
  } & MenuRows & (
    | { version_id: string; version_number: number; published_at: Date }
    | { version_id: null; version_number: null; published_at: null }
  )>(
    `select v.id as venue_id, v.name as venue_name, v.link_token,
            b.id as brand_id, b.name as brand_name, b.logo_url, b.colour, b.cover_url, b.display_font,
            mv.id as version_id, mv.number as version_number, mv.published_at,
            ${menuContentColumns}
     from app.venues v
     join app.brands b on b.id = v.brand_id
     left join app.menu_versions mv on mv.id = b.published_menu_version_id
     cross join lateral (select mv.id as menu_version_id, v.id as venue_id) scope
     where v.link_token = $1`,
    [input.venueLinkToken],
  );
  if (!row) return null;

  const sections = localizeMenuSections(menuSectionsFromRows(row), language.data);
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

/** A null Venue reads the Brand's base prices and full Menu. */
export async function readMenuSections(tx: Tx, versionId: string, venueId: string | null): Promise<MenuDraftContent["sections"]> {
  const { rows: [row] } = await tx.query<MenuRows>(
    `select ${menuContentColumns}
     from (values ($1::uuid, $2::uuid)) as scope(menu_version_id, venue_id)`,
    [versionId, venueId],
  );
  return menuSectionsFromRows(row);
}

function menuSectionsFromRows({ sections, dishes, groups, choices }: MenuRows): MenuDraftContent["sections"] {
  const name = (row: LocalizedRow) => ({ en: row.name_en, am: row.name_am });
  return sections.map((section) => ({
    sectionId: section.id,
    name: name(section),
    dishes: dishes.filter((dish) => dish.section_id === section.id).map((dish) => ({
      dishId: dish.id,
      name: name(dish),
      description: { en: dish.description_en, am: dish.description_am },
      priceSantim: dish.price_santim,
      fasting: dish.fasting,
      ...(dish.photo_url ? { photoUrl: dish.photo_url } : {}),
      houseFavourite: dish.house_favourite,
      optionGroups: groups.filter((group) => group.dish_id === dish.id).map((group) => ({
        optionGroupId: group.id,
        name: name(group),
        kind: group.kind,
        required: group.required,
        choices: choices.filter((choice) => choice.option_group_id === group.id).map((choice) => ({
          choiceId: choice.id,
          name: name(choice),
          priceChangeSantim: choice.price_change_santim,
        })),
      })),
    })),
  }));
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
