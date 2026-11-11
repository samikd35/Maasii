import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import type { Bill } from "./bills";
import { inTransaction } from "./db";
import { MaasiiError } from "./errors";
import type { Bilingual } from "./language";
import { parseInput } from "./validation";

const venueLink = z.object({ venueLinkToken: z.string().min(1).max(200) });
const experience = z.enum(["great", "okay", "needs_work"]);
const base = venueLink.extend({
  visitId: z.uuid(),
  language: z.enum(["am", "en"]),
  comment: z.string().trim().max(500).optional(),
});
const reviewInput = z.discriminatedUnion("kind", [
  base.extend({
    kind: z.literal("visit"),
    rating: experience,
    topics: z.array(z.enum(["food", "service", "wait_time", "paying"])).max(4).optional(),
  }),
  base.extend({
    kind: z.literal("dish"),
    dishId: z.uuid(),
    rating: z.enum(["yes", "maybe", "no"]),
    topics: z.array(z.enum(["taste", "portion", "temperature", "value"])).max(4).optional(),
  }),
  base.extend({
    kind: z.literal("waiter"),
    rating: experience,
    topics: z.array(z.enum(["service", "wait_time"])).max(2).optional(),
  }),
]);

export type GuestReviewForm = {
  visitId: string;
  brandName: string;
  waiterName: string | null;
  dishes: { id: string; name: Bilingual }[];
  submitted: string[];
};

export async function getGuestReviewForm(actor: Actor, input: z.input<typeof venueLink>): Promise<GuestReviewForm | null> {
  if (actor.kind !== "guest") return null;
  const { venueLinkToken } = parseInput(venueLink, input);
  return inTransaction(actor, async (tx) => {
    const { rows: [form] } = await tx.query<Omit<GuestReviewForm, "dishes"> & { lines: Bill["lines"] }>(
      `select v.id as "visitId", b.name as "brandName", w.name as "waiterName", v.bill_lines as lines, g.reviewed_parts as submitted
       from app.venues venue
       join app.brands b on b.id = venue.brand_id
       join app.guest_table_choices g on g.venue_id = venue.id
       join app.visits v on v.id = g.visit_id
       left join lateral app.review_waiter(v.id) w on true
       where venue.link_token = $1 and g.guest_user_id = $2 and v.closed_reason = 'paid'`,
      [venueLinkToken, actor.userId],
    );
    if (!form) return null;
    const { lines, ...details } = form;
    const dishes = [...new Map(lines.map(({ dishId, name }) => [dishId, { id: dishId, name }])).values()];
    return { ...details, dishes };
  });
}

export async function submitGuestReview(actor: Actor, input: z.input<typeof reviewInput>): Promise<void> {
  if (actor.kind !== "guest") throw new MaasiiError("not_allowed", "Only a Guest can review their Visit.");
  const review = parseInput(reviewInput, input);
  await inTransaction(actor, async (tx) => {
    const { rows: [{ status }] } = await tx.query<{ status: string }>(
      "select app.submit_guest_review($1, $2, $3, $4, $5, $6, $7, $8) as status",
      [review.venueLinkToken, review.visitId, review.kind, review.kind === "dish" ? review.dishId : null,
        review.rating, [...new Set(review.topics)], review.comment || null, review.language],
    );
    if (status !== "saved") throw new MaasiiError("not_allowed", "This Review is unavailable or already submitted.");
  });
}

export async function getWaiterRatings(actor: Actor, input: { venueId: string }) {
  const { venueId } = parseInput(z.object({ venueId: z.uuid() }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const { rows } = await tx.query<{
      waiterId: string; waiterName: string; count: number; great: number; okay: number; needsWork: number;
    }>(
      `select m.id as "waiterId", m.name as "waiterName", count(*)::int as count,
         (count(*) filter (where r.rating = 'great'))::int as great,
         (count(*) filter (where r.rating = 'okay'))::int as okay,
         (count(*) filter (where r.rating = 'needs_work'))::int as "needsWork"
       from app.reviews r join app.memberships m on m.id = r.waiter_id
       where r.venue_id = $1 and r.kind = 'waiter' group by m.id, m.name order by m.name, m.id`,
      [venueId],
    );
    return rows;
  });
}
