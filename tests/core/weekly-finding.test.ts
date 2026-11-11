import { expect, test } from "vitest";
import { getOwnerVenuesInService, getWeeklyFinding, selectWeeklyFinding, updateVenueService, weeklyThresholds } from "@/core";
import { scenario } from "../support/scenario";

test("Weekly Finding picks the first qualifying rule and uses configured samples", () => {
  const dish = {
    id: "omelette", name: { en: "Omelette", am: "" },
    currentReview: { count: 8, topics: [{ topic: "temperature", count: 2 }] },
    periods: [{ name: "Lunch", current: 5, previous: 10 }, { name: "Dinner", current: 1, previous: 11 }],
  };
  const visitReviews = Array.from({ length: 20 }, (_, index) => ({
    current: index < 10,
    rating: index < 4 ? "needs_work" as const : "great" as const,
  }));
  const report = { dishes: [dish], visitReviews };
  expect(selectWeeklyFinding(report)).toMatchObject({ kind: "topic", dishId: "omelette", topic: "temperature", count: 2, total: 8 });
  expect(selectWeeklyFinding(report, { ...weeklyThresholds, dishReviews: 9 }))
    .toMatchObject({ kind: "quantity", dishId: "omelette", periodIndex: 1, previous: 11, current: 1 });
  expect(selectWeeklyFinding(report, { ...weeklyThresholds, topicShare: 0.26, previousQuantity: 12 }))
    .toMatchObject({ kind: "visit", current: { count: 4, total: 10 }, previous: { count: 0, total: 10 } });
  expect(selectWeeklyFinding(report, { dishReviews: 9, topicShare: 0.25, previousQuantity: 12, visitReviews: 11 }))
    .toEqual({ kind: "insufficient", dishReviews: 8, previousQuantity: 11, currentVisits: 10, previousVisits: 10 });
  expect(selectWeeklyFinding({ dishes: [{ ...dish, currentReview: { count: 4, topics: [{ topic: "taste", count: 4 }] }, periods: [] }], visitReviews: [] }))
    .toMatchObject({ kind: "insufficient", dishReviews: 4, currentVisits: 0 });
});

test("Owners see their Venues within overnight Addis Ababa service hours", async () => {
  const s = await scenario().venue("Late").venue("Early").manager("Hana").build();
  await updateVenueService(s.owner.actor, { venueId: s.venue.id, hours: { opensAt: "20:00", closesAt: "02:00" }, periods: [] });
  await updateVenueService(s.owner.actor, { venueId: s.venues.Early.id, hours: { opensAt: "07:00", closesAt: "12:00" }, periods: [] });
  const now = new Date("2026-11-11T22:59:00Z");
  expect(await getOwnerVenuesInService(s.owner.actor, { now })).toEqual([s.venue.id]);
  expect(await getOwnerVenuesInService(s.managers.Hana.actor, { now })).toEqual([]);
  expect(await getOwnerVenuesInService(s.owner.actor, { now: new Date("2026-11-11T23:00:00Z") })).toEqual([]);
  expect(await getWeeklyFinding(s.owner.actor, { venueId: s.venue.id }, { now }))
    .toMatchObject({ week: "2026-11-02", finding: { kind: "insufficient" } });
});
