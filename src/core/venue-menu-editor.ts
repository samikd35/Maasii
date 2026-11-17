import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { brandArtworkBucket, prepareBrandArtwork, uploadBrandArtwork } from "./brand-artwork";
import type { Brand } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { assignIdentities, draftMenuInput, isFastingDay, menuDraftChanged, menuInput, readMenuSections, type MenuDraft, type MenuDraftContent } from "./menu";
import { parseInput } from "./validation";
import { mergeVenueMenu, type VenueMenuChanges } from "./venue-menu-changes";

const target = z.object({ venueId: z.uuid() });
const edit = target.extend({
  revision: z.string().max(160),
  menu: draftMenuInput,
  inherit: z.array(z.uuid()).default([]),
  publish: z.boolean(),
});
type Dish = MenuDraftContent["sections"][number]["dishes"][number];
const fields = ["priceSantim", "fasting", "photoUrl", "houseFavourite", "optionGroups"] as const;

async function venueContext(tx: Tx, venueId: string) {
  const { rows: [venue] } = await tx.query<{
    name: string; brand: Brand; version: string | null; publishedAt: Date | null;
    publishedId: string | null; published: VenueMenuChanges | null;
    draftId: string | null; draft: VenueMenuChanges | null;
  }>(
    `select v.name, b.published_menu_version_id as version,
            jsonb_build_object('id', b.id, 'name', b.name, 'logoUrl', b.logo_url, 'colour', b.colour,
                               'coverUrl', b.cover_url, 'displayFont', b.display_font) as brand,
            p.id as "publishedId", coalesce(p.published_at, m.published_at) as "publishedAt", p.changes as published,
            d.revision as "draftId", d.changes as draft
     from app.venues v join app.brands b on b.id = v.brand_id
     left join app.menu_versions m on m.id = b.published_menu_version_id
     left join app.venue_menu_drafts d on d.venue_id = v.id
     left join lateral (
       select id, published_at, changes from app.venue_menu_revisions where venue_id = v.id order by id desc limit 1
     ) p on true where v.id = $1`, [venueId],
  );
  if (!venue) throw new MaasiiError("not_found", "Venue not found.");
  return venue;
}

async function editorState(tx: Tx, venueId: string) {
  const venue = await venueContext(tx, venueId);
  const base = venue.version ? await readMenuSections(tx, venue.version, null) : [];
  const legacy = venue.published ? [] : (await tx.query<{ dish_id: string; price_santim: number }>(
    "select dish_id, price_santim from app.venue_dish_settings where venue_id = $1 and price_santim is not null", [venueId],
  )).rows;
  const changes = venue.draft ?? venue.published ?? {
    edits: Object.fromEntries(legacy.map(({ dish_id, price_santim }) => [dish_id, { priceSantim: price_santim }])),
    additions: [], removed: [],
  };
  return { venue, base, changes, revision: `${venue.version ?? "-"}:${venue.draftId ?? venue.publishedId ?? "-"}` };
}

export async function getVenueMenuDraft(actor: Actor, input: { venueId: string }, { now = new Date() } = {}) {
  const { venueId } = parseInput(target, input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const { venue, base, changes, revision } = await editorState(tx, venueId);
    const draft: MenuDraft = {
      brand: venue.brand,
      venueName: venue.name,
      menu: mergeVenueMenu(base, changes),
      revision,
      hasUnpublishedChanges: venue.draft !== null,
      lastPublishedAt: venue.publishedAt,
      fastingDay: await isFastingDay(tx, now),
    };
    return { draft, inherited: base, missing: Object.keys(changes.edits).filter((id) => !base.some((s) => s.dishes.some((d) => d.dishId === id))).length };
  });
}

function validateIdentity(menu: MenuDraftContent) {
  const dishes = [...menu.sections.flatMap((s) => s.dishes), ...menu.archivedDishes.map((entry) => entry.dish)];
  for (const ids of [
    menu.sections.map((s) => s.sectionId), dishes.map((d) => d.dishId),
    dishes.flatMap((d) => d.optionGroups.map((g) => g.optionGroupId)),
    dishes.flatMap((d) => d.optionGroups.flatMap((g) => g.choices.map((c) => c.choiceId))),
  ]) {
    if (new Set(ids).size !== ids.length) throw new MaasiiError("invalid_input", "The Venue Menu contains duplicate identities.");
  }
}

function localPhoto(venue: Awaited<ReturnType<typeof venueContext>>, venueId: string, url: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const prefix = `${base}/storage/v1/object/public/brand-artwork/${venue.brand.id}/venues/${venueId}/`;
  return Boolean(base && url.startsWith(prefix) && /^dish-[\da-f-]+\.webp$/.test(url.slice(prefix.length)));
}

export async function saveVenueMenu(actor: Actor, input: z.input<typeof edit>, { now = new Date() } = {}) {
  const { venueId, revision, menu, publish, inherit } = parseInput(edit, input);
  const submitted = assignIdentities(menu);
  validateIdentity(submitted);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const context = await venueContext(tx, venueId);
    // Serialize with both Brand publishing and other edits of this Venue.
    await tx.query("select pg_advisory_xact_lock_shared(hashtextextended($1::uuid::text, 2))", [context.brand.id]);
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1::uuid::text, 3))", [venueId]);
    const { venue, base, changes, revision: current } = await editorState(tx, venueId);
    if (revision !== current) throw menuDraftChanged();

    const inherited = new Map(base.flatMap((section) => section.dishes.map((dish) => [dish.dishId, dish] as const)));
    const effective = mergeVenueMenu(base, changes);
    const previous = new Map([...effective.sections.flatMap((s) => s.dishes), ...effective.archivedDishes.map((e) => e.dish)]
      .map((dish) => [dish.dishId, dish]));
    const active = new Set(submitted.sections.flatMap((s) => s.dishes.map((d) => d.dishId)));
    const removed = new Set(changes.removed);
    const edits = { ...changes.edits };
    const additions = new Map<string, MenuDraftContent["sections"][number]>();
    const sections = [...submitted.sections.map(({ sectionId, name, dishes }) => ({ sectionId, name, dishes })),
      ...submitted.archivedDishes.map(({ sectionId, sectionName, dish }) => ({ sectionId, name: sectionName, dishes: [dish] }))];
    const reset = new Set(inherit);
    for (const { sectionId, name, dishes } of sections) {
      for (const dish of dishes) {
        const original = inherited.get(dish.dishId);
        const last = previous.get(dish.dishId);
        if (dish.photoUrl && dish.photoUrl !== original?.photoUrl && dish.photoUrl !== last?.photoUrl
          && !localPhoto(venue, venueId, dish.photoUrl)) {
          throw new MaasiiError("invalid_input", "Upload photos for this Venue.", "invalidBrandArtwork");
        }
        if (active.has(dish.dishId)) removed.delete(dish.dishId);
        else removed.add(dish.dishId);
        if (original) {
          const patch: VenueMenuChanges["edits"][string] = { ...edits[dish.dishId] };
          const restoring = reset.has(dish.dishId);
          for (const field of ["name", "description"] as const) {
            const localized: Partial<Dish["name"]> = { ...patch[field] };
            for (const language of ["am", "en"] as const) {
              const value = dish[field][language];
              if (!restoring && value === last?.[field][language]) continue;
              if (value === original[field][language]) delete localized[language];
              else localized[language] = value;
            }
            if (Object.keys(localized).length) patch[field] = localized;
            else delete patch[field];
          }
          for (const field of fields) {
            if (!restoring && isDeepStrictEqual(dish[field], last?.[field])) continue;
            if (isDeepStrictEqual(dish[field], original[field])) delete patch[field];
            else Object.assign(patch, { [field]: dish[field] ?? null });
          }
          if (Object.keys(patch).length) edits[dish.dishId] = patch;
          else delete edits[dish.dishId];
        } else {
          const local = additions.get(sectionId) ?? { sectionId, name, dishes: [] as Dish[] };
          local.dishes.push(dish);
          additions.set(sectionId, local);
        }
      }
    }
    for (const id of inherited.keys()) if (!active.has(id)) removed.add(id);
    const updated = { edits, additions: [...additions.values()], removed: [...removed] };
    const preview = mergeVenueMenu(base, updated);
    validateIdentity(preview);
    if (publish) {
      parseInput(menuInput, preview, "menuDraftInvalid");
      const newIds = updated.additions.flatMap((section) => section.dishes.map((dish) => dish.dishId));
      if (newIds.length) {
        await tx.query(
          `insert into app.dishes (id, brand_id, venue_id) select id, $1, $2 from unnest($3::uuid[]) as id
           on conflict (id) do nothing`, [venue.brand.id, venueId, newIds],
        );
        const { rowCount } = await tx.query("select id from app.dishes where venue_id = $1 and id = any($2::uuid[])", [venueId, newIds]);
        if (rowCount !== newIds.length) throw new MaasiiError("invalid_input", "This Dish identity belongs to a different Menu.");
      }
      await tx.query("insert into app.venue_menu_revisions (venue_id, changes, published_at) values ($1, $2, $3)", [venueId, updated, now]);
      await tx.query("delete from app.venue_menu_drafts where venue_id = $1", [venueId]);
    } else {
      await tx.query(
        `insert into app.venue_menu_drafts (venue_id, changes) values ($1, $2)
         on conflict (venue_id) do update set changes = excluded.changes, revision = gen_random_uuid()`,
        [venueId, updated],
      );
    }
  });
}

export async function uploadVenueDishPhoto(actor: Actor, input: { venueId: string; photo: File }) {
  const { venueId, photo } = parseInput(target.extend({ photo: z.file() }), input);
  const brandId = await inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    return (await venueContext(tx, venueId)).brand.id;
  });
  const bytes = await prepareBrandArtwork(photo, 960, 960);
  return uploadBrandArtwork(brandArtworkBucket(), `${brandId}/venues/${venueId}/dish-${crypto.randomUUID()}.webp`, bytes);
}
