import { expect, test } from "vitest";
import { getPublishedMenu, publicActor, publishMenu, type MenuInput } from "@/core";
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
