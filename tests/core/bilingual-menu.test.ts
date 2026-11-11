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
