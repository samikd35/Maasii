import { expect, test } from "vitest";
import {
  addFastingPeriod,
  adminActor,
  getPublishedMenu,
  listFastingPeriods,
  publicActor,
  removeFastingPeriod,
  updateFastingPeriod,
} from "@/core";
import { scenario } from "../support/scenario";
import { createPlatformAdmin } from "../support/users";

test("calendar changes immediately change which dishes the guest Menu features in Addis Ababa", async () => {
  const admin = await createPlatformAdmin();
  const s = await scenario().publishedMenu({
    sections: [{ name: "Lunch", dishes: [{ name: "Shiro", priceSantim: 15_000, fasting: true }] }],
  }).build();
  // Addis Ababa is already on Monday when it is Sunday evening UTC.
  const now = new Date("2040-09-02T21:00:00Z");
  const guestFastingDishes = async () => (await getPublishedMenu(
    publicActor, { venueLinkToken: s.venue.linkToken }, { now },
  ))?.fastingDishes.map((dish) => dish.name);
  const season = { startsOn: "2040-09-03", endsOn: "2040-09-06", fasting: true };
  const exception = { startsOn: "2040-09-03", endsOn: "2040-09-03", fasting: false };
  const movedException = { startsOn: "2040-09-04", endsOn: "2040-09-04", fasting: false };

  expect(await guestFastingDishes()).toEqual([]);
  await addFastingPeriod(admin.actor, season);
  try {
    expect(await guestFastingDishes()).toEqual(["Shiro"]);
    await addFastingPeriod(admin.actor, exception);
    let currentException = exception;
    try {
      expect(await guestFastingDishes()).toEqual([]);
      currentException = await updateFastingPeriod(admin.actor, { period: exception, changes: movedException });
      expect(await guestFastingDishes()).toEqual(["Shiro"]);
      expect(await listFastingPeriods(admin.actor)).toEqual(expect.arrayContaining([season, movedException]));
    } finally {
      await removeFastingPeriod(admin.actor, currentException);
    }
  } finally {
    await removeFastingPeriod(admin.actor, season);
  }
  expect(await guestFastingDishes()).toEqual([]);
  expect(await listFastingPeriods(admin.actor)).not.toEqual(expect.arrayContaining([season]));
});

test("only the platform admin can maintain the calendar, and the dates must be valid", async () => {
  const admin = await createPlatformAdmin();
  const { owner } = await scenario().build();
  const period = { startsOn: "2040-10-02", endsOn: "2040-10-03", fasting: true };

  for (const actor of [publicActor, owner.actor, adminActor(owner.userId)]) {
    await expect(listFastingPeriods(actor)).rejects.toMatchObject({ code: "not_allowed" });
    await expect(addFastingPeriod(actor, period)).rejects.toMatchObject({ code: "not_allowed" });
    await expect(updateFastingPeriod(actor, { period, changes: period })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(removeFastingPeriod(actor, period)).rejects.toMatchObject({ code: "not_allowed" });
  }
  await expect(addFastingPeriod(admin.actor, { ...period, endsOn: "2040-10-01" }))
    .rejects.toMatchObject({ code: "invalid_input", reason: "invalidFastingDates" });
  await expect(addFastingPeriod(admin.actor, { ...period, endsOn: "2040-11-31" }))
    .rejects.toMatchObject({ code: "invalid_input" });
  await addFastingPeriod(admin.actor, period);
  try {
    await expect(addFastingPeriod(admin.actor, period))
      .rejects.toMatchObject({ code: "invalid_input", reason: "fastingPeriodExists" });
  } finally {
    await removeFastingPeriod(admin.actor, period);
  }
});
