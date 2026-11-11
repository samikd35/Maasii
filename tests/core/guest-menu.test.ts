import { expect, test } from "vitest";
import { getPublishedMenu, publicActor, publishMenu, type MenuInput } from "@/core";
import { scenario } from "../support/scenario";

test("a guest opening the Venue Link sees the brand's published Menu in order", async () => {
  const s = await scenario()
    .brand("Bilo's")
    .venue("Lancha", { tables: 16 })
    .publishedMenu({
      sections: [
        {
          name: { en: "Breakfast" },
          dishes: [
            { name: { en: "Omelette" }, description: { en: "Our classic omelette" }, priceSantim: 22_000 },
            { name: { en: "Waffle" }, description: { en: "Golden and crisp" }, priceSantim: 18_000 },
          ],
        },
        {
          name: { en: "Drinks" },
          dishes: [{ name: { en: "Macchiato" }, description: { en: "Espresso with a dash of milk" }, priceSantim: 6_000 }],
        },
      ],
    })
    .build();

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });

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
          name: { en: "Breakfast" },
          dishes: [
            { dishId: omelette, name: { en: "Omelette" }, description: { en: "Now with toast" }, priceSantim: 25_000 },
            { name: { en: "Scrambled Eggs" }, description: { en: "Fresh, local eggs" }, priceSantim: 17_000 },
          ],
        },
        {
          name: { en: "Drinks" },
          dishes: [
            { dishId: macchiato, name: { en: "Macchiato" }, description: { en: "Espresso with milk" }, priceSantim: 6_500 },
          ],
        },
      ],
    },
  });

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });

  expect(menu?.menuVersion?.number).toBe(2);
  const dishes = menu!.sections.flatMap((section) => section.dishes);
  expect(dishes.map((d) => d.name)).toEqual(["Omelette", "Scrambled Eggs", "Macchiato"]);
  expect(dishes[0]).toMatchObject({ id: omelette, description: "Now with toast", priceSantim: 25_000 });
  expect(dishes[2]).toMatchObject({ id: macchiato, priceSantim: 6_500 });
  expect(dishes.map((d) => d.name)).not.toContain("Chechebsa");
});

test("an unknown Venue Link finds no menu", async () => {
  expect(await getPublishedMenu(publicActor, { venueLinkToken: "no-such-venue", language: "en" })).toBeNull();
});

test("a Venue whose Brand has not published a Menu yet shows no sections", async () => {
  const s = await scenario().brand("Saba House").venue("Bole").build();

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken, language: "en" });

  expect(menu).toMatchObject({ brand: { name: "Saba House" }, venue: { name: "Bole" }, menuVersion: null, sections: [] });
});

test("the guest Menu follows Wednesdays, Fridays and dated fasting periods in Addis Ababa", async () => {
  const s = await scenario().publishedMenu({
    sections: [
      { name: "Breakfast", dishes: [{ name: "Omelette", priceSantim: 22_000 }] },
      { name: "Drinks", dishes: [{ name: "Black Coffee", priceSantim: 6_000, fasting: true }] },
    ],
  }).build();

  const dates = [
    ["2026-10-06T21:00:00Z", true],  // Wednesday starts at midnight in Addis Ababa.
    ["2026-10-07T21:00:00Z", false], // Thursday in Addis Ababa.
    ["2026-10-09T12:00:00Z", true],
    ["2026-01-05T12:00:00Z", true],  // Fast of the Prophets carries over from 2025.
    ["2026-01-07T12:00:00Z", false], // Christmas overrides a Wednesday.
    ["2026-02-02T12:00:00Z", true],  // Nineveh starts on Monday.
    ["2026-04-11T12:00:00Z", true],  // Last day of Lent.
    ["2026-05-27T12:00:00Z", false], // A Wednesday during the post-Easter exception.
    ["2026-06-01T12:00:00Z", true],  // Apostles' Fast starts on Monday.
    ["2026-08-08T12:00:00Z", true],  // A Saturday during Filseta.
    ["2026-11-24T12:00:00Z", true],  // Fast of the Prophets starts on Tuesday.
  ] as const;

  for (const [date, fasting] of dates) {
    const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }, { now: new Date(date) });
    expect(menu?.fastingDishes.map((dish) => dish.name), date).toEqual(fasting ? ["Black Coffee"] : []);
  }
});

test("an Owner can publish one House favourite with a photo, then clear it", async () => {
  const almondCake = {
    name: "Almond Cake", priceSantim: 20_000, photoUrl: "/brands/bilos/almond-cake.webp", houseFavourite: true,
  };
  const s = await scenario().publishedMenu({ sections: [{ name: "Cakes", dishes: [almondCake] }] }).build();
  const readMenu = () => getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });

  expect((await readMenu())?.houseFavourite).toMatchObject({
    id: s.dishId("Almond Cake"), name: "Almond Cake", photoUrl: almondCake.photoUrl,
  });

  const publishCakes = (dishes: MenuInput["sections"][number]["dishes"]) =>
    publishMenu(s.owner.actor, { brandId: s.brand.id, menu: { sections: [{ name: "Cakes", dishes }] } });
  await expect(publishCakes([almondCake, { ...almondCake, name: "Lemon Cake" }]))
    .rejects.toMatchObject({ code: "invalid_input" });
  await expect(publishCakes([{ name: "Lemon Cake", priceSantim: 20_000, houseFavourite: true }]))
    .rejects.toMatchObject({ code: "invalid_input" });

  await publishCakes([{ ...almondCake, houseFavourite: false }]);
  expect((await readMenu())?.houseFavourite).toBeNull();
});
