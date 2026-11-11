import { z } from "zod";
import { requireBrandOwner } from "./access";
import type { Actor } from "./actor";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import type { Bilingual } from "./language";
import { parseInput } from "./validation";

const venueTarget = z.object({ venueId: z.uuid() });
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const period = z.object({ name: z.string().trim().min(1).max(80), startsAt: time, endsAt: time });
const settingsInput = venueTarget.extend({
  hours: z.object({ opensAt: time, closesAt: time }),
  periods: z.array(period).max(24),
});
const insightInput = venueTarget.extend({ week: z.iso.date().optional() });

export type ServicePeriod = z.output<typeof period>;
type Settings = Pick<z.output<typeof settingsInput>, "hours" | "periods">;

function minutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function inTimeRange(value: number, start: string, end: string) {
  const from = minutes(start);
  const until = minutes(end);
  return from < until ? value >= from && value < until : value >= from || value < until;
}

async function ownerVenue(tx: Tx, actor: Actor, venueId: string) {
  const { rows: [venue] } = await tx.query<{ name: string; brandId: string }>(
    'select name, brand_id as "brandId" from app.venues where id = $1', [venueId],
  );
  if (!venue) throw new MaasiiError("not_found", "Venue not found.");
  await requireBrandOwner(tx, actor, venue.brandId);
  return venue;
}

export async function updateVenueService(actor: Actor, input: z.input<typeof settingsInput>) {
  const { venueId, hours, periods } = parseInput(settingsInput, input);
  if (hours.opensAt === hours.closesAt) throw new MaasiiError("invalid_input", "Opening and closing times must differ.", "serviceHours");
  const names = new Set<string>();
  for (const [index, candidate] of periods.entries()) {
    const name = candidate.name.toLowerCase();
    if (names.has(name) || candidate.startsAt === candidate.endsAt || periods.slice(0, index).some((previous) =>
      inTimeRange(minutes(candidate.startsAt), previous.startsAt, previous.endsAt)
      || inTimeRange(minutes(previous.startsAt), candidate.startsAt, candidate.endsAt))) {
      throw new MaasiiError("invalid_input", "Service Periods need unique names and cannot overlap.", "servicePeriods");
    }
    names.add(name);
  }
  return inTransaction(actor, async (tx) => {
    await ownerVenue(tx, actor, venueId);
    await tx.query(
      `insert into app.venue_service_settings (venue_id, opens_at, closes_at, periods) values ($1, $2, $3, $4)
       on conflict (venue_id) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, periods = excluded.periods`,
      [venueId, hours.opensAt, hours.closesAt, JSON.stringify(periods)],
    );
  });
}

type AcceptedLine = {
  orderId: string;
  tableNumber: number;
  acceptedAt: Date;
  id: string;
  name: Bilingual;
  quantity: number;
  minute: number;
  current: boolean;
};
type Review = {
  id: string;
  kind: "dish" | "visit";
  dishId: string | null;
  name: Bilingual | null;
  rating: "yes" | "maybe" | "no" | "great" | "okay" | "needs_work";
  topics: string[];
  comment: string | null;
  language: "am" | "en";
  createdAt: Date;
  current: boolean;
};

function dishReviews(reviews: Review[]) {
  const topics = new Map<string, number>();
  const ratings = { yes: 0, maybe: 0, no: 0 };
  for (const review of reviews) {
    if (review.rating in ratings) ratings[review.rating as keyof typeof ratings]++;
    for (const topic of review.topics) topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }
  return {
    count: reviews.length, ...ratings,
    topics: [...topics].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
  };
}

export async function getVenueInsights(actor: Actor, input: z.input<typeof insightInput>, { now = new Date() } = {}) {
  const { venueId, week } = parseInput(insightInput, input);
  return inTransaction(actor, async (tx) => {
    const venue = await ownerVenue(tx, actor, venueId);
    const { rows: [settings] } = await tx.query<Settings>(
      `select jsonb_build_object('opensAt', to_char(opens_at, 'HH24:MI'), 'closesAt', to_char(closes_at, 'HH24:MI')) as hours, periods
       from app.venue_service_settings where venue_id = $1`, [venueId],
    );
    const { rows: [calendar] } = await tx.query<{ week: string; previousWeek: string }>(
      `select monday::date::text as week, (monday::date - 7)::text as "previousWeek"
       from date_trunc('week', coalesce($1::date::timestamp, $2::timestamptz at time zone 'Africa/Addis_Ababa')) monday`,
      [week ?? null, now],
    );
    const { rows: accepted } = await tx.query<AcceptedLine>(
      `select o.id as "orderId", o.table_number as "tableNumber", o.accepted_at as "acceptedAt",
        line->>'dishId' as id, line->'name' as name, (line->>'quantity')::int as quantity,
        extract(hour from local_time)::int * 60 + extract(minute from local_time)::int as minute,
        local_time >= $2::date::timestamp as current
       from app.orders o join app.visits v on v.id = o.visit_id
       cross join lateral (select o.accepted_at at time zone 'Africa/Addis_Ababa' as local_time) clock
       cross join lateral jsonb_array_elements(o.lines) with ordinality as lines(line, position)
       where o.venue_id = $1 and o.state = 'accepted' and line->>'dropReason' is null
         and not ((o.id::text || ':' || (position - 1)::text) = any(v.bill_removed_lines))
         and o.accepted_at >= (($2::date - 7)::timestamp at time zone 'Africa/Addis_Ababa')
         and o.accepted_at < (($2::date + 7)::timestamp at time zone 'Africa/Addis_Ababa')
       order by o.accepted_at desc, o.id, position`, [venueId, calendar.week],
    );
    const { rows: reviews } = await tx.query<Review>(
      `select r.id, r.kind, r.dish_id as "dishId", r.rating, r.topics, r.comment, r.language,
        r.created_at as "createdAt", local_time >= $2::date::timestamp as current,
        (select line->'name' from jsonb_array_elements(v.bill_lines) line
          where line->>'dishId' = r.dish_id::text limit 1) as name
       from app.reviews r join app.visits v on v.id = r.visit_id
       cross join lateral (select r.created_at at time zone 'Africa/Addis_Ababa' as local_time) clock
       where r.venue_id = $1 and r.kind in ('visit', 'dish')
         and r.created_at >= (($2::date - 7)::timestamp at time zone 'Africa/Addis_Ababa')
         and r.created_at < (($2::date + 7)::timestamp at time zone 'Africa/Addis_Ababa')
       order by r.created_at desc, r.id`, [venueId, calendar.week],
    );
    const periods = settings?.periods ?? [];
    const orders = accepted.map((line) => ({
      ...line, period: periods.findIndex(({ startsAt, endsAt }) => inTimeRange(line.minute, startsAt, endsAt)),
    }));
    const dishNames = new Map<string, Bilingual>();
    for (const line of orders) if (!dishNames.has(line.id)) dishNames.set(line.id, line.name);
    for (const review of reviews) if (review.dishId && review.name && !dishNames.has(review.dishId)) {
      dishNames.set(review.dishId, review.name);
    }
    // ponytail: the two-week Venue window stays in memory for evidence links. Aggregate in SQL if it outgrows the pilot.
    const dishes = [...dishNames].map(([id, name]) => {
      const lines = orders.filter((line) => line.id === id);
      const quantity = (period: number, current: boolean) => lines
        .filter((line) => line.period === period && line.current === current).reduce((sum, line) => sum + line.quantity, 0);
      const dishRatings = reviews.filter((review) => review.dishId === id);
      return {
        id, name,
        periods: periods.map(({ name }, index) => ({ name, current: quantity(index, true), previous: quantity(index, false) })),
        outside: { current: quantity(-1, true), previous: quantity(-1, false) },
        currentReview: dishReviews(dishRatings.filter(({ current }) => current)),
        previousReview: dishReviews(dishRatings.filter(({ current }) => !current)),
      };
    });
    return { venueId, venueName: venue.name, ...calendar, settings: settings ?? null, dishes, orders,
      visitReviews: reviews.filter(({ kind }) => kind === "visit"), dishReviewEvidence: reviews.filter(({ kind }) => kind === "dish"),
    };
  });
}
