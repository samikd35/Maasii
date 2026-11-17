import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  addWaiterOrder, getPublishedMenu, getVenueMenuDraft, getWaiterQuickAdd, publicActor,
  publishMenu, recordBrowsingEvent, saveVenueMenu, setVenueDishPrice, setVenueDishSoldOut, startShift,
} from "@/core";
import { scenario } from "../support/scenario";

test("a Manager publishes scoped changes to prices and Dishes without rewriting shared or historical data", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").waiter("Sam").publishedMenu().build();
  const { id: venueId, linkToken: venueLinkToken } = s.venue;
  const manager = s.managers.Hana.actor;
  const omelette = s.dishId("Omelette");
  const waiter = s.waiters.Sam;
  const tableId = s.venue.tables[0].id;
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: waiter.waiterId }] });
  await setVenueDishPrice(s.owner.actor, { venueId, dishId: omelette, priceSantim: 23000 });

  const published = async (token = venueLinkToken) => (await getPublishedMenu(publicActor, { venueLinkToken: token }))!
    .sections.flatMap((section) => section.dishes);
  const initial = await getVenueMenuDraft(manager, { venueId });
  const menu = structuredClone(initial.draft.menu);
  const local = randomUUID();
  const section = menu.sections.find(({ dishes }) => dishes.some((d) => d.dishId === omelette))!;
  const dish = section.dishes.find((d) => d.dishId === omelette)!;
  expect(dish.priceSantim).toBe(23000);
  dish.priceSantim = 0;
  dish.description.en = "Lancha special";
  section.dishes.push({
    dishId: local, name: { en: "Local stew", am: "" }, description: { en: "", am: "" },
    priceSantim: 25000, fasting: false, houseFavourite: false, optionGroups: [],
  });
  const input = { venueId, revision: initial.draft.revision!, menu, publish: false };
  await expect(saveVenueMenu(manager, { ...input, venueId: s.venues.Bole.id })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(saveVenueMenu(waiter.actor, input)).rejects.toMatchObject({ code: "not_allowed" });
  await expect(getVenueMenuDraft(publicActor, { venueId })).rejects.toMatchObject({ code: "not_allowed" });
  await saveVenueMenu(manager, input);
  expect(await published()).toEqual(expect.arrayContaining([expect.objectContaining({ id: omelette, priceSantim: 23000 })]));
  expect((await published()).some((d) => d.id === local)).toBe(false);
  const saved = (await getVenueMenuDraft(manager, { venueId })).draft;
  await expect(saveVenueMenu(manager, { ...input, publish: true })).rejects.toMatchObject({ reason: "menuDraftChanged" });
  await saveVenueMenu(manager, { ...input, revision: saved.revision!, menu: saved.menu, publish: true });
  expect(await published()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: omelette, description: "Lancha special", priceSantim: 0 }),
    expect.objectContaining({ id: local, name: "Local stew", priceSantim: 25000 }),
  ]));
  expect((await published(s.venues.Bole.linkToken)).find((d) => d.id === omelette)?.priceSantim).toBe(22000);
  const quick = await getWaiterQuickAdd(waiter.actor, { tableId, unlockToken: waiter.unlockToken });
  expect(quick.dishes).toEqual(expect.arrayContaining([expect.objectContaining({ dishId: local, priceSantim: 25000 })]));
  const order = await addWaiterOrder(waiter.actor, {
    tableId, unlockToken: waiter.unlockToken, requestId: randomUUID(),
    lines: [{ dishId: local, choiceIds: [], quantity: 1, note: "" }],
  });
  await recordBrowsingEvent(publicActor, {
    venueLinkToken, event: { kind: "dish_opened", pageLoadId: randomUUID(), dishId: local },
  });
  await setVenueDishSoldOut(manager, { venueId, dishId: local, soldOut: true });
  expect((await published()).some((d) => d.id === local)).toBe(false);
  await setVenueDishSoldOut(manager, { venueId, dishId: local, soldOut: false });

  const newer = (await getVenueMenuDraft(manager, { venueId })).draft;
  const archiveSection = newer.menu.sections.find((s) => s.dishes.some((d) => d.dishId === local))!;
  newer.menu.archivedDishes.push({
    sectionId: archiveSection.sectionId, sectionName: archiveSection.name,
    dish: archiveSection.dishes.find((d) => d.dishId === local)!,
  });
  archiveSection.dishes = archiveSection.dishes.filter((d) => d.dishId !== local);
  await saveVenueMenu(manager, { venueId, revision: newer.revision!, menu: newer.menu, publish: true });
  const publishedBrand = (await getVenueMenuDraft(manager, { venueId })).inherited;
  const brandDish = publishedBrand.flatMap((s) => s.dishes).find((d) => d.dishId === omelette)!;
  brandDish.name.en = "New Brand name";
  brandDish.priceSantim = 24000;
  await publishMenu(s.owner.actor, { brandId: s.brand.id, menu: { sections: publishedBrand } });
  expect((await published()).find((d) => d.id === omelette)).toMatchObject({ name: "New Brand name", priceSantim: 0 });
  expect((await published()).some((d) => d.id === local)).toBe(false);
  const replay = await addWaiterOrder(waiter.actor, {
    tableId, unlockToken: waiter.unlockToken, requestId: order.requestId!,
    lines: [{ dishId: local, choiceIds: [], quantity: 1, note: "" }],
  });
  expect(replay.lines).toEqual(order.lines);

  const { draft, inherited } = await getVenueMenuDraft(manager, { venueId });
  const archived = draft.menu.archivedDishes.pop()!;
  draft.menu.sections.find((s) => s.sectionId === archived.sectionId)!.dishes.push(archived.dish);
  const resetSection = draft.menu.sections.find((s) => s.dishes.some((d) => d.dishId === omelette))!;
  resetSection.dishes = resetSection.dishes.map((d) => d.dishId === omelette
    ? inherited.flatMap((s) => s.dishes).find((base) => base.dishId === omelette)! : d);
  await saveVenueMenu(manager, { venueId, revision: draft.revision!, menu: draft.menu, inherit: [omelette], publish: true });
  expect((await published()).find((d) => d.id === omelette)?.priceSantim).toBe(24000);
  expect((await published()).some((d) => d.id === local)).toBe(true);
});
