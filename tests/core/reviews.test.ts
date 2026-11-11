import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  acceptOrder, confirmPayment, getGuestReviewForm, getWaiterRatings, guestActor,
  prepareBill, sendOrder, startShift, submitGuestReview,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

async function guest() {
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  return guestActor(data.user!.id);
}

test("paid guests can review independently and only management sees ten or more Waiter Ratings", async () => {
  const s = await scenario().manager("Hana").waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const { id: venueId, linkToken: venueLinkToken } = s.venue;
  const tableId = s.venue.tables[0].id;
  const dishId = s.dishId("Omelette");
  const venue = { venueLinkToken };
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] });
  const people = await Promise.all(Array.from({ length: 10 }, guest));
  const outsider = await guest();
  const orders = await Promise.all(people.map((person) => sendOrder(person, {
    ...venue, tableId, requestId: randomUUID(),
    lines: [{ dishId, choiceIds: [], quantity: 1, note: "" }],
  })));
  const order = orders[0];
  const target = { venueId, visitId: order.visitId, unlockToken: sam.unlockToken };
  await acceptOrder(sam.actor, { orderId: order.id, unlockToken: sam.unlockToken });
  expect(await getGuestReviewForm(people[0], venue)).toBeNull();
  await prepareBill(sam.actor, target);
  await confirmPayment(sam.actor, { ...target, paymentOptionId: null, receiptAmountSantim: 22_000 });

  expect(await getGuestReviewForm(outsider, venue)).toBeNull();
  expect(await getGuestReviewForm(people[0], venue)).toMatchObject({
    visitId: order.visitId, waiterName: "Sam", dishes: [{ id: dishId, name: { en: "Omelette" } }], submitted: [],
  });
  const common = { ...venue, visitId: order.visitId, language: "en" as const };
  const visitReview = { ...common, kind: "visit" as const, rating: "great" as const, topics: ["food" as const], comment: "Good meal." };
  await expect(submitGuestReview(outsider, visitReview)).rejects.toMatchObject({ code: "not_allowed" });
  const duplicate = await Promise.allSettled([
    submitGuestReview(people[0], visitReview),
    submitGuestReview(people[0], visitReview),
  ]);
  expect(duplicate.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  await submitGuestReview(people[0], { ...common, kind: "dish", dishId, rating: "yes", topics: ["taste"] });
  expect((await getGuestReviewForm(people[0], venue))?.submitted).toEqual(["visit", `dish:${dishId}`]);

  const rating = { ...common, kind: "waiter" as const, rating: "great" as const };
  for (const person of people.slice(0, 9)) await submitGuestReview(person, rating);
  expect(await getWaiterRatings(s.owner.actor, { venueId })).toEqual([]);
  await submitGuestReview(people[9], rating);
  expect(await getWaiterRatings(s.managers.Hana.actor, { venueId })).toMatchObject([
    { waiterId: sam.waiterId, waiterName: "Sam", count: 10, great: 10 },
  ]);
  await expect(getWaiterRatings(sam.actor, { venueId })).rejects.toMatchObject({ code: "not_allowed" });
});
