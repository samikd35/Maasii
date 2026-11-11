import type { Actor } from "./actor";
import { inTransaction } from "./db";
import { getVenueInsights } from "./insights";

export const weeklyThresholds = {
  dishReviews: 5,
  topicShare: 0.25,
  previousQuantity: 10,
  visitReviews: 10,
};

type VenueInsights = Awaited<ReturnType<typeof getVenueInsights>>;
type FindingReport = {
  dishes: (Pick<VenueInsights["dishes"][number], "id" | "name" | "periods"> & {
    currentReview: Pick<VenueInsights["dishes"][number]["currentReview"], "count" | "topics">;
  })[];
  visitReviews: Pick<VenueInsights["visitReviews"][number], "current" | "rating">[];
};

export function selectWeeklyFinding(report: FindingReport, thresholds = weeklyThresholds) {
  const topics = report.dishes.flatMap((dish) => {
    const total = dish.currentReview.count;
    if (total < thresholds.dishReviews) return [];
    return dish.currentReview.topics.filter(({ count }) => count / total >= thresholds.topicShare)
      .map(({ topic, count }) => ({ dishId: dish.id, name: dish.name, topic, count, total }));
  });
  topics.sort((a, b) => b.count / b.total - a.count / a.total || b.count - a.count
    || a.dishId.localeCompare(b.dishId) || a.topic.localeCompare(b.topic));
  if (topics[0]) return { kind: "topic" as const, ...topics[0] };

  const declines = report.dishes.flatMap((dish) => dish.periods.flatMap((period, periodIndex) =>
    period.previous >= thresholds.previousQuantity && period.previous > period.current
      ? [{ ...period, dishId: dish.id, name: dish.name, period: period.name, periodIndex, drop: period.previous - period.current }]
      : [],
  ));
  declines.sort((a, b) => b.drop - a.drop || a.dishId.localeCompare(b.dishId) || a.periodIndex - b.periodIndex);
  if (declines[0]) return { kind: "quantity" as const, ...declines[0] };

  const current = { count: 0, total: 0 };
  const previous = { count: 0, total: 0 };
  for (const review of report.visitReviews) {
    const bucket = review.current ? current : previous;
    bucket.total++;
    if (review.rating === "needs_work") bucket.count++;
  }
  if (current.total >= thresholds.visitReviews && previous.total >= thresholds.visitReviews
    && current.count * previous.total > previous.count * current.total) {
    return { kind: "visit" as const, current, previous };
  }

  return {
    kind: "insufficient" as const,
    dishReviews: report.dishes.reduce((max, dish) => Math.max(max, dish.currentReview.count), 0),
    previousQuantity: report.dishes.reduce((max, dish) => dish.periods.reduce((largest, period) => Math.max(largest, period.previous), max), 0),
    currentVisits: current.total,
    previousVisits: previous.total,
  };
}

export async function getWeeklyFinding(
  actor: Actor, input: { venueId: string; week?: string }, { now = new Date(), thresholds = weeklyThresholds } = {},
) {
  // A complete week keeps the quantity comparison from treating upcoming service as a drop.
  const previousWeek = new Date(now.getTime() - 7 * 86_400_000);
  const report = await getVenueInsights(actor, input, { now: previousWeek });
  return { venueId: report.venueId, week: report.week, previousWeek: report.previousWeek, finding: selectWeeklyFinding(report, thresholds) };
}

export async function getOwnerVenuesInService(actor: Actor, { now = new Date() } = {}) {
  return inTransaction(actor, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select v.id from app.venues v join app.venue_service_settings s on s.venue_id = v.id
       cross join lateral (select ($1::timestamptz at time zone 'Africa/Addis_Ababa')::time as local_time) clock
       where app.is_brand_owner(v.brand_id) and case when s.opens_at < s.closes_at then
          local_time >= s.opens_at and local_time < s.closes_at
        else local_time >= s.opens_at or local_time < s.closes_at end
       order by v.id`, [now],
    );
    return rows.map(({ id }) => id);
  });
}
