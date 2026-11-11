import { expect, test } from "vitest";
import {
  createWaiterJoinCode,
  getPublishedMenu,
  getVenueMenuSettings,
  joinWaiter,
  listVenueDishChanges,
  priceDraftLine,
  publicActor,
  setVenueDishPrice,
  setVenueDishSoldOut,
} from "@/core";
import { scenario } from "../support/scenario";

test("a Manager hides and restores a published dish only at their own Venue", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu({
    sections: [{
      name: { en: "Breakfast" },
      dishes: [
        { name: { en: "Chechebsa", am: "ጨጨብሳ" }, priceSantim: 19_000, fasting: true,
          houseFavourite: true, photoUrl: "/brands/bilos/almond-cake.webp" },
        { name: { en: "Omelette" }, priceSantim: 22_000 },
      ],
    }],
  }).build();
  const target = { venueId: s.venue.id, dishId: s.dishId("Chechebsa") };
  const manager = s.managers.Hana.actor;
  const readMenu = (venueLinkToken: string) =>
    getPublishedMenu(publicActor, { venueLinkToken }, { now: new Date("2026-10-07T12:00:00Z") });
  const favourite = { id: target.dishId, name: "Chechebsa" };

  await setVenueDishSoldOut(manager, { ...target, soldOut: true });

  expect(await readMenu(s.venue.linkToken)).toMatchObject({
    sections: [{ dishes: [{ name: "Omelette" }] }],
    fastingDishes: [],
    houseFavourite: null,
  });
  expect(await readMenu(s.venues.Bole.linkToken)).toMatchObject({
    sections: [{ dishes: [favourite, { name: "Omelette" }] }],
    fastingDishes: [favourite],
    houseFavourite: favourite,
  });
  const settings = await getVenueMenuSettings(manager, { venueId: target.venueId, language: "am" });
  expect(settings.sections[0].dishes[0]).toMatchObject({ name: { en: "Chechebsa", am: "ጨጨብሳ" }, soldOut: true });

  await setVenueDishSoldOut(manager, { ...target, soldOut: false });
  expect(await readMenu(s.venue.linkToken)).toMatchObject({
    sections: [{ dishes: [favourite, { name: "Omelette" }] }],
    fastingDishes: [favourite],
    houseFavourite: favourite,
  });
});

test("only the Brand's Owner can set or clear a Venue price, with the changes attributed", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const anotherBrand = await scenario().publishedMenu().build();
  const target = { venueId: s.venue.id, dishId: s.dishId("Omelette") };
  const manager = s.managers.Hana;
  const owner = s.owner;
  const setAt = new Date("2026-11-11T08:00:00Z");
  const soldOutAt = new Date("2026-11-11T08:01:00Z");
  const clearAt = new Date("2026-11-11T08:02:00Z");
  const restoredAt = new Date("2026-11-11T08:03:00Z");
  const draftLine = { dishId: target.dishId, dishName: "Omelette", choices: [], quantity: 2, note: "" };
  const getGuestMenu = async (venueLinkToken: string) => (await getPublishedMenu(publicActor, { venueLinkToken }))!;

  await setVenueDishPrice(owner.actor, { ...target, priceSantim: 0 }, { now: setAt });
  const menu = await getGuestMenu(s.venue.linkToken);
  expect(menu.menuVersion?.id).toBe(s.menu?.menuVersionId);
  expect(priceDraftLine(menu, draftLine)).toMatchObject({ totalSantim: 0, problems: [] });
  expect(priceDraftLine(await getGuestMenu(s.venues.Bole.linkToken), draftLine).totalSantim).toBe(44_000);

  for (const actor of [manager.actor, anotherBrand.owner.actor, publicActor]) {
    await expect(setVenueDishPrice(actor, { ...target, priceSantim: null })).rejects.toMatchObject({ code: "not_allowed" });
  }
  await expect(setVenueDishSoldOut(manager.actor, { ...target, venueId: s.venues.Bole.id, soldOut: true }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(setVenueDishSoldOut(manager.actor, { ...target, dishId: anotherBrand.dishId("Omelette"), soldOut: true }))
    .rejects.toMatchObject({ code: "not_found" });
  const qr = await createWaiterJoinCode(manager.actor, { venueId: target.venueId, siteUrl: "https://maasii.test" });
  const waiter = await joinWaiter(publicActor, { token: qr.token, name: "Sam", pin: "0427" });
  await expect(setVenueDishSoldOut(waiter.actor, { ...target, soldOut: true }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(getVenueMenuSettings(publicActor, { venueId: target.venueId }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(setVenueDishPrice(owner.actor, { ...target, priceSantim: -1 }))
    .rejects.toMatchObject({ code: "invalid_input" });

  await setVenueDishSoldOut(manager.actor, { ...target, soldOut: true }, { now: soldOutAt });
  expect(priceDraftLine(await getGuestMenu(s.venue.linkToken), draftLine).problems).toEqual([{ kind: "dish_gone" }]);
  expect((await getVenueMenuSettings(manager.actor, target)).sections[0].dishes[0].venuePriceSantim).toBe(0);
  await setVenueDishPrice(owner.actor, { ...target, priceSantim: null }, { now: clearAt });
  expect(priceDraftLine(await getGuestMenu(s.venue.linkToken), draftLine).problems).toEqual([{ kind: "dish_gone" }]);
  await setVenueDishSoldOut(owner.actor, { ...target, soldOut: false }, { now: restoredAt });
  expect(priceDraftLine(await getGuestMenu(s.venue.linkToken), draftLine).totalSantim).toBe(44_000);

  await expect(listVenueDishChanges(manager.actor, { venueId: target.venueId })).rejects.toMatchObject({ code: "not_allowed" });
  expect(await listVenueDishChanges(owner.actor, { venueId: target.venueId })).toEqual([
    expect.objectContaining({ dishId: target.dishId, actorUserId: owner.userId, changedAt: restoredAt, soldOut: false, priceSantim: null }),
    expect.objectContaining({ dishId: target.dishId, actorUserId: owner.userId, changedAt: clearAt, soldOut: true, priceSantim: null }),
    expect.objectContaining({ dishId: target.dishId, actorUserId: manager.userId, changedAt: soldOutAt, soldOut: true, priceSantim: 0 }),
    expect.objectContaining({ dishId: target.dishId, actorUserId: owner.userId, changedAt: setAt, soldOut: false, priceSantim: 0 }),
  ]);
});
