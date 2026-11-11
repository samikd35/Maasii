import { expect, test } from "vitest";
import { getPublishedMenu, publicActor } from "@/core";
import { scenario } from "../support/scenario";

test("a guest reads the published Menu in Amharic or in English", async () => {
  const s = await scenario()
    .publishedMenu({
      sections: [
        {
          name: { en: "Breakfast", am: "ቁርስ" },
          dishes: [
            {
              name: { en: "Omelette", am: "ኦምሌት" },
              description: { en: "Our classic omelette", am: "የእኛ ክላሲክ ኦምሌት" },
              priceSantim: 22_000,
            },
          ],
        },
      ],
    })
    .build();

  const amharic = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "am" });
  const english = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });

  expect(amharic?.sections).toMatchObject([
    { name: "ቁርስ", dishes: [{ name: "ኦምሌት", description: "የእኛ ክላሲክ ኦምሌት", priceSantim: 22_000 }] },
  ]);
  expect(english?.sections).toMatchObject([
    { name: "Breakfast", dishes: [{ name: "Omelette", description: "Our classic omelette", priceSantim: 22_000 }] },
  ]);
});

test("text missing in one language falls back to the other rather than showing a blank", async () => {
  const s = await scenario()
    .publishedMenu({
      sections: [
        {
          name: { am: "ኬኮች" },
          dishes: [
            { name: { en: "Opera Cake" }, description: { am: "የአልሞንድ ኬክ በቡና" }, priceSantim: 22_000 },
            { name: { en: "Tiramisu", am: "ቲራሚሱ" }, priceSantim: 24_000 },
          ],
        },
      ],
    })
    .build();

  const amharic = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "am" });
  const english = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });

  expect(amharic?.sections).toMatchObject([
    {
      name: "ኬኮች",
      dishes: [
        { name: "Opera Cake", description: "የአልሞንድ ኬክ በቡና" },
        { name: "ቲራሚሱ", description: "" },
      ],
    },
  ]);
  expect(english?.sections).toMatchObject([
    {
      name: "ኬኮች",
      dishes: [
        { name: "Opera Cake", description: "የአልሞንድ ኬክ በቡና" },
        { name: "Tiramisu", description: "" },
      ],
    },
  ]);
});

test("Option Group and choice names follow the Menu language and keep their ids", async () => {
  const s = await scenario().publishedMenu({
    sections: [
      {
        name: "Sandwiches",
        dishes: [
          {
            name: "Tuna Sandwich",
            priceSantim: 38_000,
            optionGroups: [
              {
                name: { en: "Bagel", am: "ቤግል" },
                kind: "choose_one",
                required: true,
                choices: [
                  { name: { en: "Sesame", am: "ሰሊጥ" }, priceChangeSantim: 2_000 },
                  { name: "Plain" },
                  { name: { am: "አጃ" } },
                ],
              },
              { name: "Extras", kind: "add_extras", choices: [{ name: "Cheese" }] },
            ],
          },
        ],
      },
    ],
  }).build();

  const en = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;
  const am = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "am" }))!;
  const english = en.sections[0].dishes[0];
  const amharic = am.sections[0].dishes[0];

  expect(english.optionGroups.map((group) => group.name)).toEqual(["Bagel", "Extras"]);
  expect(english.optionGroups[0].choices.map((choice) => choice.name)).toEqual(["Sesame", "Plain", "አጃ"]);
  expect(amharic).toMatchObject({
    id: english.id,
    optionGroups: [
      {
        id: english.optionGroups[0].id,
        name: "ቤግል",
        choices: [
          { id: english.optionGroups[0].choices[0].id, name: "ሰሊጥ", priceChangeSantim: 2_000 },
          { id: english.optionGroups[0].choices[1].id, name: "Plain" },
          { id: english.optionGroups[0].choices[2].id, name: "አጃ" },
        ],
      },
      { name: "Extras" },
    ],
  });
});
