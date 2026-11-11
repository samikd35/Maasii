import { expect, test } from "vitest";
import { getPublishedMenu, publicActor, publishMenu } from "@/core";
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

test("publishing a new Menu version changes what guests see, and dishes keep their identity", async () => {
  const s = await scenario().publishedMenu().build();
  const omelette = s.dishId("Omelette");
  const macchiato = s.dishId("Macchiato");

  await publishMenu(s.owner.actor, {
    brandId: s.brand.id,
    menu: {
      sections: [
        {
          name: "Breakfast",
          dishes: [
            { dishId: omelette, name: "Omelette", description: "Now with toast", priceSantim: 25_000 },
            { name: "Scrambled Eggs", description: "Fresh, local eggs", priceSantim: 17_000 },
          ],
        },
        {
          name: "Drinks",
          dishes: [{ dishId: macchiato, name: "Macchiato", description: "Espresso with milk", priceSantim: 6_500 }],
        },
      ],
    },
  });

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });

  expect(menu?.menuVersion?.number).toBe(2);
  const dishes = menu!.sections.flatMap((section) => section.dishes);
  expect(dishes.map((d) => d.name)).toEqual(["Omelette", "Scrambled Eggs", "Macchiato"]);
  expect(dishes[0]).toMatchObject({ id: omelette, description: "Now with toast", priceSantim: 25_000 });
  expect(dishes[2]).toMatchObject({ id: macchiato, priceSantim: 6_500 });
  expect(dishes.map((d) => d.name)).not.toContain("Chechebsa");
});

test("an unknown Venue Link finds no menu", async () => {
  expect(await getPublishedMenu(publicActor, { venueLinkToken: "no-such-venue" })).toBeNull();
});

test("a Venue whose Brand has not published a Menu yet shows no sections", async () => {
  const s = await scenario().brand("Saba House").venue("Bole").build();

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });

  expect(menu).toMatchObject({ brand: { name: "Saba House" }, venue: { name: "Bole" }, menuVersion: null, sections: [] });
});
