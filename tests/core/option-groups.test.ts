import { expect, test } from "vitest";
import { getMenuDraft, getPublishedMenu, publicActor, publishMenu, publishMenuDraft, saveMenuDraft, type MenuInput } from "@/core";
import { scenario } from "../support/scenario";

const bagelMenu: MenuInput = {
  sections: [
    {
      name: "Sandwiches",
      dishes: [
        {
          name: "Tuna Sandwich",
          description: "Flaked tuna on a bagel",
          priceSantim: 38_000,
          optionGroups: [
            {
              name: "Bagel",
              kind: "choose_one",
              required: true,
              choices: [{ name: "Plain" }, { name: "Sesame" }, { name: "Whole wheat", priceChangeSantim: 2_000 }],
            },
            {
              name: "Extras",
              kind: "add_extras",
              choices: [{ name: "Cheese", priceChangeSantim: 4_000 }, { name: "Avocado", priceChangeSantim: 5_000 }],
            },
          ],
        },
        { name: "Veggie Wrap", priceSantim: 30_000, fasting: true, photoUrl: "/brands/test/wrap.jpg" },
      ],
    },
  ],
};

test("a guest sees a published dish's Option Groups, fasting label and photo", async () => {
  const s = await scenario().publishedMenu(bagelMenu).build();

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });

  const [tuna, wrap] = menu!.sections[0].dishes;
  expect(tuna).toMatchObject({
    name: "Tuna Sandwich",
    fasting: false,
    photoUrl: null,
    optionGroups: [
      {
        name: "Bagel",
        kind: "choose_one",
        required: true,
        choices: [
          { name: "Plain", priceChangeSantim: 0 },
          { name: "Sesame", priceChangeSantim: 0 },
          { name: "Whole wheat", priceChangeSantim: 2_000 },
        ],
      },
      {
        name: "Extras",
        kind: "add_extras",
        required: false,
        choices: [
          { name: "Cheese", priceChangeSantim: 4_000 },
          { name: "Avocado", priceChangeSantim: 5_000 },
        ],
      },
    ],
  });
  expect(wrap).toMatchObject({ name: "Veggie Wrap", fasting: true, photoUrl: "/brands/test/wrap.jpg", optionGroups: [] });
});

test("a Menu with an invalid Option Group is refused", async () => {
  const s = await scenario().build();
  const omeletteWith = (optionGroups: unknown) => ({
    sections: [{ name: "Breakfast", dishes: [{ name: "Omelette", priceSantim: 24_000, optionGroups }] }],
  });

  for (const optionGroups of [
    [{ name: "Extras", kind: "add_extras", required: true, choices: [{ name: "Cheese" }] }],
    [{ name: "Bagel", kind: "choose_one", required: true, choices: [] }],
    [{ name: "Extras", kind: "add_extras", choices: [{ name: "Cheese", priceChangeSantim: -500 }] }],
    [{ name: " ", kind: "add_extras", choices: [{ name: "Cheese" }] }],
    [{ name: "Size", kind: "pick_two", choices: [{ name: "Large" }] }],
  ]) {
    await expect(
      publishMenu(s.owner.actor, { brandId: s.brand.id, menu: omeletteWith(optionGroups) as MenuInput }),
      JSON.stringify(optionGroups),
    ).rejects.toMatchObject({ code: "invalid_input" });
  }

  const sameChoiceTwice = crypto.randomUUID();
  await expect(
    publishMenu(s.owner.actor, {
      brandId: s.brand.id,
      menu: omeletteWith([
        { name: "Extras", kind: "add_extras", choices: [{ choiceId: sameChoiceTwice, name: "Cheese" }] },
        { name: "More extras", kind: "add_extras", choices: [{ choiceId: sameChoiceTwice, name: "Ham" }] },
      ]) as MenuInput,
    }),
  ).rejects.toMatchObject({ code: "invalid_input" });
});

test("Option Groups and their choices keep their ids when the Menu is published again", async () => {
  const s = await scenario().publishedMenu(bagelMenu).build();
  const first = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;
  const tuna = first.sections[0].dishes[0];
  const [bagel] = tuna.optionGroups;

  await publishMenu(s.owner.actor, {
    brandId: s.brand.id,
    menu: {
      sections: [
        {
          name: "Sandwiches",
          dishes: [
            {
              dishId: tuna.id,
              name: "Tuna Sandwich",
              priceSantim: 40_000,
              optionGroups: [
                {
                  optionGroupId: bagel.id,
                  name: "Bagel",
                  kind: "choose_one",
                  required: true,
                  choices: [{ choiceId: bagel.choices[1].id, name: "Sesame" }, { name: "Rye" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  const second = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;
  const [bagelAgain] = second.sections[0].dishes[0].optionGroups;
  expect(bagelAgain.id).toBe(bagel.id);
  expect(bagelAgain.choices.map((c) => c.name)).toEqual(["Sesame", "Rye"]);
  expect(bagelAgain.choices[0].id).toBe(bagel.choices[1].id);
});

test("an Owner can save unfinished Option Groups and publish the completed choices with their original IDs", async () => {
  const s = await scenario().publishedMenu(bagelMenu).build();
  const actor = s.owner.actor;
  const input = { brandId: s.brand.id };
  const guestMenu = (language: "en" | "am") => getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language });
  const draft = await getMenuDraft(actor, input);
  const [bagel, extras] = draft.menu.sections[0].dishes[0].optionGroups;
  const group = {
    optionGroupId: crypto.randomUUID(), name: { en: "", am: "" },
    kind: "add_extras" as const, required: false, choices: [],
  };
  draft.menu.sections[0].dishes[0].optionGroups = [extras, group, bagel];
  const revision = await saveMenuDraft(actor, { ...input, revision: draft.revision, menu: draft.menu });
  await expect(publishMenuDraft(actor, { ...input, revision })).rejects.toMatchObject({ reason: "menuDraftInvalid" });
  expect((await guestMenu("en"))?.sections[0].dishes[0].optionGroups.map((g) => g.name)).toEqual(["Bagel", "Extras"]);

  const saved = await getMenuDraft(actor, input);
  const [tuna] = saved.menu.sections[0].dishes;
  const [savedExtras, newGroup] = tuna.optionGroups;
  newGroup.name = { en: "Spreads", am: "ቅባቶች" };
  newGroup.choices.push({ choiceId: crypto.randomUUID(), name: { en: "Butter", am: "ቅቤ" }, priceChangeSantim: 750 });
  savedExtras.choices[0].name.am = "አይብ";
  savedExtras.choices[0].priceChangeSantim = 4250;

  await publishMenuDraft(actor, { ...input, revision, menu: saved.menu });
  const groups = (await guestMenu("am"))!.sections[0].dishes[0].optionGroups;
  expect(groups.map((g) => g.id)).toEqual([extras.optionGroupId, group.optionGroupId, bagel.optionGroupId]);
  expect(groups[0].choices[0]).toMatchObject({ id: extras.choices[0].choiceId, name: "አይብ", priceChangeSantim: 4250 });
  expect(groups[1]).toMatchObject({ name: "ቅባቶች", choices: [{ name: "ቅቤ", priceChangeSantim: 750 }] });
});
