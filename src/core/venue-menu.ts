import { z } from "zod";
import { requireBrandOwner, requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { findVenue } from "./brands";
import { inTransaction } from "./db";
import { MaasiiError } from "./errors";
import { inLanguage, languages, type Bilingual, type Language } from "./language";
import { readMenuSections, readPublishedMenu } from "./menu";
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
    const published = await readPublishedMenu(tx, { venueLinkToken: venue.linkToken, language }, new Date(), { includeSoldOut: true });
    const version = published?.menu.menuVersion;
    const base = version ? await readMenuSections(tx, version.id, null) : [];
    const prices = new Map(base.flatMap((s) => s.dishes.map((dish) => [dish.dishId, dish.priceSantim])));
    const soldOut = published?.soldOut;
    const sections: VenueMenuSection[] = (published?.menuSections ?? []).map((section) => ({
      id: section.sectionId, name: inLanguage(section.name, language),
      dishes: section.dishes.map((dish) => {
        const basePrice = prices.get(dish.dishId);
        return {
          id: dish.dishId, name: dish.name, soldOut: soldOut?.has(dish.dishId) ?? false,
          brandPriceSantim: basePrice ?? dish.priceSantim,
          venuePriceSantim: dish.priceSantim === basePrice ? null : dish.priceSantim,
        };
      }),
    }));
    return { venue, isOwner: actor.kind === "system" || owner.rows[0].ok, sections };
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
    if (soldOut !== null) {
      const venue = await findVenue(tx, venueId);
      const published = await readPublishedMenu(tx, { venueLinkToken: venue.linkToken }, now, { includeSoldOut: true });
      if (!published?.menuSections.some((section) => section.dishes.some((dish) => dish.dishId === dishId))) {
        throw new MaasiiError("not_found", "That dish is not on this Venue's published Menu.");
      }
    }
    await tx.query("select set_config('app.venue_dish_changed_at', $1, true)", [now.toISOString()]);
    const { rowCount } = await tx.query(
      `insert into app.venue_dish_settings as settings (venue_id, dish_id, sold_out, price_santim)
       select $1, $2, coalesce($3::boolean, false), $4
       where $3::boolean is not null or exists (
         select 1 from app.venues v join app.brands b on b.id = v.brand_id
         join app.menu_version_dishes d on d.menu_version_id = b.published_menu_version_id
         where v.id = $1 and d.dish_id = $2
       )
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
