import { z } from "zod";
import { requirePlatformAdmin } from "./access";
import { adminActor, type Actor } from "./actor";
import type { Venue, VenueTable } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { readVenuePaymentOptions } from "./payment-options";
import { parseInput } from "./validation";

const brandInput = z.object({ brandId: z.uuid() });

/** Opens one Brand in a scoped transaction. The data and its audit entry are committed together. */
export async function openBrandSupport(
  actor: Actor,
  input: z.input<typeof brandInput>,
  { now = new Date() }: { now?: Date } = {},
) {
  if (actor.kind !== "support") throw new MaasiiError("not_allowed", "Only platform admin support can open this view.");
  const { brandId } = parseInput(brandInput, input);
  const admin = adminActor(actor.userId);

  return inTransaction(admin, async (tx) => {
    await requirePlatformAdmin(tx, admin);
    const { rows: [brand] } = await tx.query<{ id: string; name: string }>(
      "select id, name from app.brands where id = $1", [brandId],
    );
    if (!brand) throw new MaasiiError("not_found", "Brand not found.");
    await tx.query("select set_config('app.brand_support_id', $1, true)", [brand.id]);

    const { rows: owners } = await tx.query<{ userId: string; name: string | null }>(
      `select user_id as "userId", name from app.memberships
       where brand_id = $1 and role = 'owner' and active order by name, id`,
      [brand.id],
    );
    const { rows: venues } = await tx.query<Venue>(
      `select id, name, brand_id as "brandId", link_token as "linkToken" from app.venues
       where brand_id = $1 order by name, id`,
      [brand.id],
    );
    const venueSupport = [];
    for (const venue of venues) venueSupport.push(await readVenueSupport(tx, venue));

    await tx.query(
      "insert into app.brand_support_openings (brand_id, admin_user_id, opened_at) values ($1, $2, $3)",
      [brand.id, actor.userId, now],
    );
    return { brand, owners, venues: venueSupport };
  });
}

async function readVenueSupport(tx: Tx, venue: Venue) {
  const { rows: tables } = await tx.query<VenueTable>(
    "select id, number, active from app.tables where venue_id = $1 order by number", [venue.id],
  );
  const { rows: staff } = await tx.query<{ id: string; role: "manager" | "waiter"; name: string | null }>(
    `select id, role, name from app.memberships
     where venue_id = $1 and active order by role, name, id`,
    [venue.id],
  );
  const paymentOptions = await readVenuePaymentOptions(tx, venue.id);
  // ponytail: all Visits per Venue. Paginate once closed Visit history grows.
  const { rows: visits } = await tx.query<{ id: string; tableNumber: number; openedAt: Date; closedAt: Date | null }>(
    `select v.id, t.number as "tableNumber", v.opened_at as "openedAt", v.closed_at as "closedAt"
     from app.visits v join app.tables t on (t.venue_id, t.id) = (v.venue_id, v.table_id)
     where v.venue_id = $1 order by v.opened_at desc, v.id`,
    [venue.id],
  );
  return { ...venue, tables, staff, paymentOptions, visits };
}

export async function listBrandSupportOpenings(actor: Actor, input: z.input<typeof brandInput>) {
  const { brandId } = parseInput(brandInput, input);
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const { rows } = await tx.query<{ brandId: string; adminUserId: string; openedAt: Date }>(
      `select brand_id as "brandId", admin_user_id as "adminUserId", opened_at as "openedAt"
       from app.brand_support_openings where brand_id = $1 order by opened_at desc, id desc`,
      [brandId],
    );
    return rows;
  });
}
