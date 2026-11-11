import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  getMenuDraft, getPublishedMenu, importMenuPhotos, publicActor, publishMenuDraft, saveMenuDraft, suggestMenuTranslations,
  type MenuDraftModel,
} from "@/core";
import { scenario } from "../support/scenario";

async function menuPhoto() {
  return new File([await readFile("public/brands/bilos/almond-cake.webp")], "private-owner-filename.webp", {
    type: "image/webp",
  });
}

test("photo import adds private, editable entries and waits for the Owner to review and publish", async () => {
  const s = await scenario().publishedMenu().build();
  const actor = s.owner.actor;
  const input = { brandId: s.brand.id };
  const before = await getMenuDraft(actor, input);
  const visible = () => getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });
  const guestBefore = await visible();
  const model: MenuDraftModel = async (request) => {
    expect(request).toEqual({ kind: "import", photos: [expect.any(Buffer), expect.any(Buffer)] });
    return { sections: [{
      name: { en: "Breakfast", am: "" },
      dishes: [
        { name: { en: "Omelette", am: "" }, description: { en: "With herbs", am: "" }, priceSantim: 24950 },
        { name: { en: "Toast", am: "" }, description: { en: "", am: "" }, priceSantim: null },
      ],
    }] };
  };

  await importMenuPhotos(actor, { ...input, revision: before.revision, photos: [await menuPhoto(), await menuPhoto()] }, { model });
  const draft = await getMenuDraft(actor, input);
  expect(draft.menu.sections.slice(0, before.menu.sections.length)).toEqual(before.menu.sections);
  const imported = draft.menu.sections.at(-1)!;
  expect(imported).toMatchObject({ imported: true, dishes: [
    { imported: "review", name: { en: "Omelette" }, description: { en: "With herbs" }, priceSantim: 24950 },
    { imported: "missing_price", name: { en: "Toast" } },
  ] });
  expect(imported.dishes[0].dishId).not.toBe(s.dishId("Omelette"));
  await expect(publishMenuDraft(actor, { ...input, revision: draft.revision })).rejects.toMatchObject({ reason: "menuAiReview" });
  expect(await visible()).toEqual(guestBefore);

  delete imported.imported;
  imported.dishes.pop();
  imported.dishes[0].name.en = "Herb Omelette";
  delete imported.dishes[0].imported;
  const revision = await saveMenuDraft(actor, { ...input, revision: draft.revision, menu: draft.menu });
  expect((await visible())!.sections.flatMap((section) => section.dishes).map(({ name }) => name)).not.toContain("Herb Omelette");
  await publishMenuDraft(actor, { ...input, revision });
  expect((await visible())!.sections.flatMap((section) => section.dishes).map(({ name }) => name)).toEqual(
    expect.arrayContaining(["Omelette", "Herb Omelette"]),
  );
  expect((await visible())!.sections.flatMap((section) => section.dishes).map(({ name }) => name)).not.toContain("Toast");
});

test("translation fills only missing languages in the draft and flags each field for review", async () => {
  const s = await scenario().publishedMenu({ sections: [{
    name: { en: "Bakery", am: "" },
    dishes: [{
      name: { en: "Honey bread", am: "የማር ዳቦ" },
      description: { en: "", am: "በማር የተዘጋጀ" },
      priceSantim: 12000,
    }],
  }] }).build();
  const input = { brandId: s.brand.id };
  const actor = s.owner.actor;
  const original = await getMenuDraft(actor, input);
  const [section] = original.menu.sections;
  const [dish] = section.dishes;
  await suggestMenuTranslations(actor, { ...input, revision: original.revision, sectionId: section.sectionId }, {
    model: async (request) => {
      expect(request).toEqual({
        kind: "translate", fields: [{ field: "name", from: "en", to: "am", text: "Bakery" }],
      });
      return { name: "ዳቦ ቤት", description: null };
    },
  });
  const afterSection = await getMenuDraft(actor, input);
  await suggestMenuTranslations(actor, {
    ...input, revision: afterSection.revision, sectionId: section.sectionId, dishId: dish.dishId,
  }, {
    model: async (request) => {
      expect(request).toEqual({
        kind: "translate", fields: [{ field: "description", from: "am", to: "en", text: "በማር የተዘጋጀ" }],
      });
      return { name: null, description: "Made with honey" };
    },
  });
  const translated = await getMenuDraft(actor, input);
  expect(translated.menu.sections).toMatchObject([{
    name: { en: "Bakery", am: "ዳቦ ቤት" }, suggestedName: "am",
    dishes: [{
      name: dish.name, description: { en: "Made with honey", am: dish.description.am }, suggestedDescription: "en",
      priceSantim: 12000,
    }],
  }]);
  await expect(publishMenuDraft(actor, { ...input, revision: translated.revision }))
    .rejects.toMatchObject({ reason: "menuAiReview" });
  const guestMenu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });
  expect(guestMenu?.sections[0].dishes[0].description).toBe("በማር የተዘጋጀ");
});

test("the model receives no requests from a non-Owner or for an invalid image", async () => {
  const s = await scenario().manager("Hana").publishedMenu().build();
  const input = { brandId: s.brand.id };
  const before = await getMenuDraft(s.owner.actor, input);
  const photos = [await menuPhoto()];
  const request = { ...input, revision: before.revision, photos };
  const model: MenuDraftModel = async () => {
    throw new Error("The provider must never be called.");
  };
  await expect(importMenuPhotos(s.managers.Hana.actor, request, { model })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(suggestMenuTranslations(publicActor, { ...input, revision: before.revision, sectionId: before.menu.sections[0].sectionId }, { model }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(importMenuPhotos(s.owner.actor, {
    ...request, photos: [new File(["not a raster"], "invalid.webp", { type: "image/webp" })],
  }, { model })).rejects.toMatchObject({ reason: "invalidBrandArtwork" });
  await expect(getMenuDraft(s.owner.actor, input)).resolves.toEqual(before);
});

test("failed, malformed, and timed-out AI responses leave the saved and published Menu untouched", async () => {
  const s = await scenario().publishedMenu({ sections: [{ name: "Tea", dishes: [] }] }).build();
  const actor = s.owner.actor;
  const input = { brandId: s.brand.id };
  const before = await getMenuDraft(actor, input);
  const photos = [await menuPhoto()];
  const failure: MenuDraftModel = async () => { throw new Error("Provider unavailable"); };
  const malformed: MenuDraftModel = async () => ({ sections: [{ name: "Unexpected schema", dishes: [] }] });
  for (const model of [failure, malformed]) {
    await expect(importMenuPhotos(actor, { ...input, revision: before.revision, photos }, { model }))
      .rejects.toMatchObject({ reason: "menuAiFailed" });
  }
  const current = structuredClone(before.menu);
  const [section] = current.sections;
  section.name.en = "New tea section";
  const translation = { ...input, revision: before.revision, sectionId: section.sectionId, menu: current };
  await expect(suggestMenuTranslations(actor, translation, {
    model: async () => ({ name: "ሻይ", description: "An unrequested field" }),
  })).rejects.toMatchObject({ reason: "menuAiFailed" });
  await expect(suggestMenuTranslations(actor, translation, { model: failure }))
    .rejects.toMatchObject({ reason: "menuAiFailed" });
  await expect(suggestMenuTranslations(actor, translation, {
    timeoutMs: 5, model: () => new Promise(() => {}),
  })).rejects.toMatchObject({ reason: "menuAiFailed" });
  await expect(getMenuDraft(actor, input)).resolves.toEqual(before);
});

test("a concurrent Owner edit wins over an in-flight suggestion", async () => {
  const s = await scenario().publishedMenu({ sections: [{ name: "Tea", dishes: [] }] }).build();
  const actor = s.owner.actor;
  const input = { brandId: s.brand.id };
  const before = await getMenuDraft(actor, input);
  const [section] = before.menu.sections;
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<unknown>();
  const suggestion = suggestMenuTranslations(actor, { ...input, revision: before.revision, sectionId: section.sectionId }, {
    model: async () => {
      started.resolve();
      return response.promise;
    },
  });
  await started.promise;
  section.name.am = "የቤት ሻይ";
  const revision = await saveMenuDraft(actor, { ...input, revision: before.revision, menu: before.menu });
  response.resolve({ name: "ሻይ", description: null });
  await expect(suggestion).rejects.toMatchObject({ reason: "menuDraftChanged" });
  await expect(getMenuDraft(actor, input)).resolves.toMatchObject({ revision, menu: before.menu });
});
