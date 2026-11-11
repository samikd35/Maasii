import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  getGuestOrders, getMenuDraft, getPublishedMenu, guestActor, publicActor, publishMenu, publishMenuDraft,
  saveMenuDraft, sendOrder, startShift, type MenuInput,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

const breakfastOnly: MenuInput = {
  sections: [
    { name: { en: "Breakfast" }, dishes: [{ name: { en: "Waffle" }, description: { en: "Golden" }, priceSantim: 18_000 }] },
  ],
};

test("only the brand's Owner can publish its Menu", async () => {
  const bilos = await scenario().brand("Bilo's").publishedMenu().build();
  const saba = await scenario().brand("Saba House").build();

  await expect(
    publishMenu(saba.owner.actor, { brandId: bilos.brand.id, menu: breakfastOnly }),
  ).rejects.toMatchObject({ code: "not_allowed" });
  await expect(
    publishMenu(publicActor, { brandId: bilos.brand.id, menu: breakfastOnly }),
  ).rejects.toMatchObject({ code: "not_allowed" });

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: bilos.venue.linkToken, language: "en" });
  expect(menu?.menuVersion?.number).toBe(1);
  expect(menu?.sections.map((s) => s.name)).toEqual(["Breakfast", "Drinks"]);
});

test("a Menu cannot reuse another brand's dish", async () => {
  const bilos = await scenario().brand("Bilo's").publishedMenu().build();
  const saba = await scenario().brand("Saba House").build();

  await expect(
    publishMenu(saba.owner.actor, {
      brandId: saba.brand.id,
      menu: {
        sections: [
          {
            name: { en: "Breakfast" },
            dishes: [{ dishId: bilos.dishId("Omelette"), name: { en: "Omelette" }, priceSantim: 20_000 }],
          },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "invalid_input" });
});

test("a Menu with a negative price or a dish unnamed in both languages is refused", async () => {
  const s = await scenario().build();

  for (const dish of [
    { name: { en: "Waffle" }, priceSantim: -100 },
    { name: { en: "  ", am: "" }, priceSantim: 18_000 },
  ]) {
    await expect(
      publishMenu(s.owner.actor, {
        brandId: s.brand.id,
        menu: { sections: [{ name: { en: "Breakfast" }, dishes: [dish] }] },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  }
});

test("only the Owner sees a saved draft, and publishing it updates every Venue with the same Dish identity", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const input = { brandId: s.brand.id };
  const draft = await getMenuDraft(s.owner.actor, input);
  expect(draft.hasUnpublishedChanges).toBe(false);
  expect(draft.lastPublishedAt).toEqual(s.menu!.publishedAt);
  draft.menu.sections[0].dishes[0].name = { en: "Garden Omelette", am: "" };
  const revision = await saveMenuDraft(s.owner.actor, { ...input, revision: draft.revision, menu: draft.menu });

  await expect(getMenuDraft(s.managers.Hana.actor, input)).rejects.toMatchObject({ code: "not_allowed" });
  await expect(getMenuDraft(publicActor, input)).rejects.toMatchObject({ code: "not_allowed" });
  await expect(publishMenuDraft(s.managers.Hana.actor, { ...input, revision })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(getMenuDraft(s.owner.actor, input)).resolves.toMatchObject({ revision, hasUnpublishedChanges: true });
  for (const venue of Object.values(s.venues)) {
    const published = await getPublishedMenu(publicActor, { venueLinkToken: venue.linkToken });
    expect(published?.sections[0].dishes[0].name).toBe("Omelette");
  }

  const now = new Date("2026-11-12T08:00:00Z");
  const published = await publishMenuDraft(s.owner.actor, { ...input, revision }, { now });
  expect(published).toMatchObject({ number: 2, publishedAt: now });
  for (const venue of Object.values(s.venues)) {
    const menu = await getPublishedMenu(publicActor, { venueLinkToken: venue.linkToken, language: "am" });
    expect(menu?.menuVersion?.id).toBe(published.menuVersionId);
    expect(menu?.sections[0].dishes[0]).toMatchObject({ id: s.dishId("Omelette"), name: "Garden Omelette" });
  }
  await expect(getMenuDraft(s.owner.actor, input)).resolves.toMatchObject({ hasUnpublishedChanges: false, lastPublishedAt: now });
});

test("publishing a draft preserves Option Group identities and existing Order line snapshots", async () => {
  const s = await scenario().publishedMenu({
    sections: [{
      name: { en: "Drinks", am: "መጠጦች" },
      dishes: [{
        name: { en: "Buna", am: "ቡና" },
        description: { en: "Fresh coffee", am: "ትኩስ ቡና" },
        priceSantim: 5_000,
        fasting: true,
        houseFavourite: true,
        photoUrl: "/brands/bilos/almond-cake.webp",
        optionGroups: [{
          name: { en: "Size", am: "መጠን" },
          kind: "choose_one",
          required: true,
          choices: [{ name: { en: "Large", am: "ትልቅ" }, priceChangeSantim: 1_000 }],
        }],
      }],
    }],
  }).build();
  const input = { brandId: s.brand.id };
  const draft = await getMenuDraft(s.owner.actor, input);
  const [section] = draft.menu.sections;
  const [dish] = section.dishes;
  const [group] = dish.optionGroups;
  const [choice] = group.choices;
  expect(section.sectionId).toBe(s.menu!.sections[0].sectionId);
  expect(group.optionGroupId).toBe(s.menu!.sections[0].dishes[0].optionGroups[0].optionGroupId);
  expect(choice.choiceId).toBe(s.menu!.sections[0].dishes[0].optionGroups[0].choices[0].choiceId);
  await expect(saveMenuDraft(s.owner.actor, { ...input, revision: draft.revision, menu: draft.menu })).resolves.toBe(draft.revision);

  const { linkToken: venueLinkToken, id: venueId } = s.venue;
  await startShift(s.owner.actor, { venueId, assignments: [] });
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  const actor = guestActor(data.user!.id);
  const sent = await sendOrder(actor, {
    venueLinkToken, tableId: s.venue.tables[0].id, requestId: randomUUID(),
    lines: [{ dishId: dish.dishId, choiceIds: [choice.choiceId], quantity: 2, note: "No sugar" }],
  });

  dish.name.en = "House Buna";
  dish.priceSantim = 5_500;
  const revision = await saveMenuDraft(s.owner.actor, { ...input, revision: draft.revision, menu: draft.menu });
  await publishMenuDraft(s.owner.actor, { ...input, revision });

  const guest = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "am" });
  expect(guest?.sections[0]).toMatchObject({
    id: section.sectionId,
    name: "መጠጦች",
    dishes: [{
      id: s.dishId("Buna"),
      name: "ቡና",
      description: "ትኩስ ቡና",
      priceSantim: 5_500,
      fasting: true,
      photoUrl: "/brands/bilos/almond-cake.webp",
      optionGroups: [{
        id: group.optionGroupId,
        name: "መጠን",
        kind: "choose_one",
        required: true,
        choices: [{ id: choice.choiceId, name: "ትልቅ", priceChangeSantim: 1_000 }],
      }],
    }],
  });
  expect(guest?.houseFavourite?.id).toBe(s.dishId("Buna"));
  const english = await getPublishedMenu(publicActor, { venueLinkToken });
  expect(english?.sections[0].dishes[0].name).toBe("House Buna");
  expect(sent.lines).toEqual([{
    dishId: dish.dishId, name: { en: "Buna", am: "ቡና" }, unitPriceSantim: 6_000,
    choices: [{ id: choice.choiceId, name: { en: "Large", am: "ትልቅ" }, priceChangeSantim: 1_000 }],
    quantity: 2, note: "No sugar",
  }]);
  await expect(getGuestOrders(actor, { venueLinkToken })).resolves.toEqual([sent]);
  await expect(getMenuDraft(s.owner.actor, input)).resolves.toMatchObject({ menu: draft.menu });
});

test("a stale editor cannot overwrite a newer draft and an incomplete draft cannot publish", async () => {
  const s = await scenario().publishedMenu().build();
  const input = { brandId: s.brand.id };
  const first = await getMenuDraft(s.owner.actor, input);
  const stale = await getMenuDraft(s.owner.actor, input);
  first.menu.sections[0].dishes[0].name = { en: "", am: "" };
  const revision = await saveMenuDraft(s.owner.actor, { ...input, revision: first.revision, menu: first.menu });

  await expect(saveMenuDraft(s.owner.actor, { ...input, revision: stale.revision, menu: stale.menu }))
    .rejects.toMatchObject({ reason: "menuDraftChanged" });
  await expect(publishMenuDraft(s.owner.actor, { ...input, revision }))
    .rejects.toMatchObject({ reason: "menuDraftInvalid" });
  await expect(getMenuDraft(s.owner.actor, input)).resolves.toMatchObject({
    revision, hasUnpublishedChanges: true, menu: first.menu,
  });
  const guest = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });
  expect(guest?.menuVersion?.number).toBe(1);
  expect(guest?.sections[0].dishes[0].name).toBe("Omelette");
});
