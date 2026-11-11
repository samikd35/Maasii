import { expect, test } from "vitest";
import { getPublishedMenu, publicActor } from "@/core";
import { scenario } from "../support/scenario";

test("a guest opening the Venue Link sees the brand's published Menu in order", async () => {
  const s = await scenario()
    .brand("Bilo's")
    .venue("Lancha", { tables: 16 })
    .publishedMenu({
      sections: [
        {
          name: "Breakfast",
          dishes: [
            { name: "Omelette", description: "Our classic omelette", priceSantim: 22_000 },
            { name: "Waffle", description: "Golden and crisp", priceSantim: 18_000 },
          ],
        },
        {
          name: "Drinks",
          dishes: [{ name: "Macchiato", description: "Espresso with a dash of milk", priceSantim: 6_000 }],
        },
      ],
    })
    .build();

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });

  expect(menu).toMatchObject({
    brand: { name: "Bilo's" },
    venue: { name: "Lancha" },
    sections: [
      {
        name: "Breakfast",
        dishes: [
          { name: "Omelette", description: "Our classic omelette", priceSantim: 22_000 },
          { name: "Waffle", description: "Golden and crisp", priceSantim: 18_000 },
        ],
      },
      {
        name: "Drinks",
        dishes: [{ name: "Macchiato", description: "Espresso with a dash of milk", priceSantim: 6_000 }],
      },
    ],
  });
});
