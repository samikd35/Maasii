import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, adjustVisitBill, confirmPayment, getVenueInsights, guestActor,
  prepareBill, sendOrder, startShift, submitGuestReview, updateVenueService,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

const minute = 60_000;
const day = 24 * 60 * minute;
async function guest() {
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  return guestActor(data.user!.id);
}

test("Dish insights compare Addis Ababa Service Periods and exclude dropped or removed lines", async () => {
  const s = await scenario().waiter("Sam").manager("Hana").publishedMenu().build();
  const sam = s.waiters.Sam;
  const venueId = s.venue.id;
  const venueLinkToken = s.venue.linkToken;
  const tableId = s.venue.tables[0].id;
  const target = { venueId };
  const hours = { opensAt: "07:00", closesAt: "22:00" };
  const breakfast = { name: "Breakfast", startsAt: "07:00", endsAt: "12:00" };
  const lunch = { name: "Lunch", startsAt: "12:00", endsAt: "17:00" };
  await expect(updateVenueService(s.managers.Hana.actor, { ...target, hours, periods: [] }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(updateVenueService(s.owner.actor, { ...target, hours, periods: [breakfast, { ...lunch, startsAt: "11:59" }] }))
    .rejects.toMatchObject({ code: "invalid_input" });
  await updateVenueService(s.owner.actor, { ...target, hours, periods: [breakfast, lunch] });

  const now = new Date();
  const addis = new Date(now.getTime() + 180 * minute);
  const offset = (addis.getUTCDay() + 6) % 7;
  const localMonday = Date.UTC(addis.getUTCFullYear(), addis.getUTCMonth(), addis.getUTCDate() - offset);
  const monday = localMonday - 180 * minute;
  const previous = new Date(monday - 7 * day + 719 * minute);
  const current = new Date(monday + 720 * minute);
  const unlockToken = sam.unlockToken;
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] }, { now: previous });

  const [one, two] = await Promise.all([guest(), guest()]);
  const dishId = s.dishId("Omelette");
  const otherDishId = s.dishId("Chechebsa");
  const send = (person: typeof one, at: Date, lines: [string, number][]) => sendOrder(person, {
    venueLinkToken, tableId, requestId: randomUUID(),
    lines: lines.map(([dishId, quantity]) => ({ dishId, quantity, choiceIds: [], note: "" })),
  }, { now: at });

  const before = await send(one, previous, [[dishId, 3]]);
  await acceptOrder(sam.actor, { orderId: before.id, unlockToken }, { now: previous });
  const previousBill = { venueId, visitId: before.visitId };
  await prepareBill(s.owner.actor, previousBill, { now: previous });
  await confirmPayment(s.owner.actor, { ...previousBill, paymentOptionId: null, receiptAmountSantim: 66_000 }, { now: previous });

  const after = await send(two, current, [[dishId, 1], [otherDishId, 1]]);
  await acceptOrder(sam.actor, { orderId: after.id, unlockToken, soldOutLineIndices: [1] }, { now: current });
  const removed = await send(two, current, [[dishId, 2]]);
  await acceptOrder(sam.actor, { orderId: removed.id, unlockToken }, { now: current });
  const bill = { venueId, visitId: after.visitId };
  await adjustVisitBill(s.owner.actor, { ...bill, kind: "remove_line", orderId: removed.id, lineIndex: 0, reason: "Returned" }, { now: current });
  await prepareBill(s.owner.actor, bill, { now: current });
  await confirmPayment(s.owner.actor, { ...bill, paymentOptionId: null, receiptAmountSantim: 22_000 }, { now: current });
  const review = { venueLinkToken, visitId: after.visitId, language: "am" as const };
  await submitGuestReview(two, { ...review, kind: "dish", dishId, rating: "yes", topics: ["taste"] });
  await submitGuestReview(two, { ...review, kind: "visit", rating: "great", comment: "Good breakfast" });

  const report = await getVenueInsights(s.owner.actor, { venueId }, { now });
  expect(report.week).toBe(new Date(localMonday).toISOString().slice(0, 10));
  expect(report.dishes).toMatchObject([{
    id: dishId,
    periods: [{ name: "Breakfast", current: 0, previous: 3 }, { name: "Lunch", current: 1, previous: 0 }],
    currentReview: { count: 1, yes: 1, maybe: 0, no: 0, topics: [{ topic: "taste", count: 1 }] },
    previousReview: { count: 0 },
  }]);
  expect(report.visitReviews).toMatchObject([{ rating: "great", comment: "Good breakfast", language: "am" }]);
});
