import { z } from "zod";
import { requireBrandOwner, requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { findVenue } from "./brands";
import { inTransaction } from "./db";
import { MaasiiError } from "./errors";
import { inLanguage, languages, type Bilingual, type Language } from "./language";
import { parseInput } from "./validation";

export type VenueMenuDish = {
  id: string;
  name: Bilingual;
  soldOut: boolean;
  brandPriceSantim: number;
  venuePriceSantim: number | null;
};
type VenueMenuSection = { id: string; name: string; dishes: VenueMenuDish[] };

export async function getVenueMenuSettings(actor: Actor, input: { venueId: string; language?: Language }) {
  const { venueId, language } = parseInput(z.object({ venueId: z.uuid(), language: z.enum(languages).default("en") }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const venue = await findVenue(tx, venueId);
    const owner = await tx.query<{ ok: boolean }>("select app.is_brand_owner($1) as ok", [venue.brandId]);
    const { rows } = await tx.query<{
      section_id: string; section_en: string; section_am: string;
      dish_id: string; name_en: string; name_am: string; sold_out: boolean;
      brand_price_santim: number; venue_price_santim: number | null;
    }>(
      `select s.section_id, s.name_en as section_en, s.name_am as section_am,
              d.dish_id, d.name_en, d.name_am, coalesce(settings.sold_out, false) as sold_out,
              d.price_santim as brand_price_santim, settings.price_santim as venue_price_santim
       from app.brands b
       join app.menu_version_sections s on s.menu_version_id = b.published_menu_version_id
       join app.menu_version_dishes d on d.menu_version_id = s.menu_version_id and d.section_id = s.section_id
       left join app.venue_dish_settings settings on settings.venue_id = $2 and settings.dish_id = d.dish_id
       where b.id = $1 order by s.position, d.position`,
      [venue.brandId, venueId],
    );
    const sections = new Map<string, VenueMenuSection>();
    for (const row of rows) {
      let section = sections.get(row.section_id);
      if (!section) {
        section = {
          id: row.section_id, name: inLanguage({ en: row.section_en, am: row.section_am }, language), dishes: [],
        };
        sections.set(row.section_id, section);
      }
      section.dishes.push({
        id: row.dish_id,
        name: { en: row.name_en, am: row.name_am },
        soldOut: row.sold_out,
        brandPriceSantim: row.brand_price_santim,
        venuePriceSantim: row.venue_price_santim,
      });
    }
    return { venue, isOwner: actor.kind === "system" || owner.rows[0].ok, sections: [...sections.values()] };
  });
}

const dishTarget = z.object({ venueId: z.uuid(), dishId: z.uuid() });
const soldOutInput = dishTarget.extend({ soldOut: z.boolean() });
const priceInput = dishTarget.extend({ priceSantim: z.number().int().min(0).max(2_147_483_647).nullable() });

export async function setVenueDishSoldOut(
  actor: Actor,
  input: z.input<typeof soldOutInput>,
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  await changeVenueDish(actor, parseInput(soldOutInput, input), now);
}

export async function setVenueDishPrice(
  actor: Actor,
  input: z.input<typeof priceInput>,
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  await changeVenueDish(actor, parseInput(priceInput, input), now);
}

async function changeVenueDish(
  actor: Actor,
  change: z.output<typeof soldOutInput> | z.output<typeof priceInput>,
  now: Date,
): Promise<void> {
  const { venueId, dishId } = change;
  const soldOut = "soldOut" in change ? change.soldOut : null;
  const priceSantim = "priceSantim" in change ? change.priceSantim : null;
  await inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    if (soldOut === null) {
      const venue = await findVenue(tx, venueId);
      await requireBrandOwner(tx, actor, venue.brandId);
    }
    await tx.query("select set_config('app.venue_dish_changed_at', $1, true)", [now.toISOString()]);
    const { rowCount } = await tx.query(
      `insert into app.venue_dish_settings as settings (venue_id, dish_id, sold_out, price_santim)
       select v.id, d.dish_id, coalesce($3::boolean, false), $4
       from app.venues v
       join app.brands b on b.id = v.brand_id
       join app.menu_version_dishes d on d.menu_version_id = b.published_menu_version_id
       where v.id = $1 and d.dish_id = $2
       on conflict (venue_id, dish_id) do update
       set sold_out = coalesce($3, settings.sold_out),
           price_santim = case when $3 is null then excluded.price_santim else settings.price_santim end`,
      [venueId, dishId, soldOut, priceSantim],
    );
    if (!rowCount) throw new MaasiiError("not_found", "That dish is not on this Venue's published Menu.");
  });
}

type VenueDishChange = {
  dishId: string;
  actorUserId: string | null;
  changedAt: Date;
  soldOut: boolean;
  priceSantim: number | null;
};

export async function listVenueDishChanges(actor: Actor, { venueId }: { venueId: string }): Promise<VenueDishChange[]> {
  return inTransaction(actor, async (tx) => {
    const venue = await findVenue(tx, venueId);
    await requireBrandOwner(tx, actor, venue.brandId);
    const { rows } = await tx.query<VenueDishChange>(
      `select dish_id as "dishId", actor_user_id as "actorUserId", changed_at as "changedAt",
              sold_out as "soldOut", price_santim as "priceSantim"
       from app.venue_dish_changes where venue_id = $1 order by changed_at desc, id desc`,
      [venueId],
    );
    return rows;
  });
}
