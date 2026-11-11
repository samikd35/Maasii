import { expect, test } from "vitest";
import { getPublishedMenu, priceDraft, priceDraftLine, publicActor, publishMenu, type GuestMenu, type MenuInput } from "@/core";
import { scenario } from "../support/scenario";

const cafeMenu: MenuInput = {
  sections: [
    {
      name: "Breakfast",
      dishes: [
        { name: "Chechebsa", priceSantim: 23_000 },
        {
          name: "Omelette",
          priceSantim: 24_000,
          optionGroups: [
            {
              name: "Extras",
              kind: "add_extras",
              choices: [
                { name: "Cheese", priceChangeSantim: 4_000 },
                { name: "Mushrooms", priceChangeSantim: 3_000 },
                { name: "Tomato & onion" },
              ],
            },
          ],
        },
        {
          name: "Tuna Sandwich",
          priceSantim: 38_000,
          optionGroups: [
            {
              name: "Bagel",
              kind: "choose_one",
              required: true,
              choices: [{ name: "Plain" }, { name: "Whole wheat", priceChangeSantim: 2_000 }],
            },
          ],
        },
      ],
    },
  ],
};

async function publishedCafeMenu(): Promise<GuestMenu> {
  const s = await scenario().publishedMenu(cafeMenu).build();
  return (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;
}

function dish(menu: GuestMenu, name: string) {
  return menu.sections.flatMap((s) => s.dishes).find((d) => d.name === name)!;
}

function choice(menu: GuestMenu, dishName: string, choiceName: string) {
  const found = dish(menu, dishName)
    .optionGroups.flatMap((g) => g.choices)
    .find((c) => c.name === choiceName)!;
  return { choiceId: found.id, name: found.name };
}

test("a dish without options costs its published price times the quantity", async () => {
  const menu = await publishedCafeMenu();

  const priced = priceDraftLine(menu, {
    dishId: dish(menu, "Chechebsa").id,
    dishName: "Chechebsa",
    choices: [],
    quantity: 3,
    note: "",
  });

  expect(priced).toMatchObject({ unitPriceSantim: 23_000, totalSantim: 69_000, problems: [] });
});

test("each chosen extra adds its price change to every portion", async () => {
  const menu = await publishedCafeMenu();

  const priced = priceDraftLine(menu, {
    dishId: dish(menu, "Omelette").id,
    dishName: "Omelette",
    choices: [choice(menu, "Omelette", "Cheese"), choice(menu, "Omelette", "Mushrooms"), choice(menu, "Omelette", "Tomato & onion")],
    quantity: 2,
    note: "No salt",
  });

  // (240 + 40 + 30 + 0) ETB a portion, two portions.
  expect(priced).toMatchObject({ unitPriceSantim: 31_000, totalSantim: 62_000, problems: [] });
});

test("a line is incomplete until every required choose-one group has a choice, but still shows its price", async () => {
  const menu = await publishedCafeMenu();
  const tuna = dish(menu, "Tuna Sandwich");

  const incomplete = priceDraftLine(menu, { dishId: tuna.id, dishName: "Tuna Sandwich", choices: [], quantity: 1, note: "" });
  expect(incomplete).toMatchObject({
    unitPriceSantim: 38_000,
    problems: [{ kind: "choice_missing", optionGroupId: tuna.optionGroups[0].id, optionGroupName: "Bagel" }],
  });

  const complete = priceDraftLine(menu, {
    dishId: tuna.id,
    dishName: "Tuna Sandwich",
    choices: [choice(menu, "Tuna Sandwich", "Whole wheat")],
    quantity: 1,
    note: "",
  });
  expect(complete).toMatchObject({ unitPriceSantim: 40_000, totalSantim: 40_000, problems: [] });
});

test("a line whose dish or choice left the published Menu says what needs attention", async () => {
  const s = await scenario().publishedMenu(cafeMenu).build();
  const before = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;
  const omelette = dish(before, "Omelette");
  const [cheese, mushrooms] = omelette.optionGroups[0].choices;
  const omeletteLine = {
    dishId: omelette.id,
    dishName: "Omelette",
    choices: [choice(before, "Omelette", "Cheese"), choice(before, "Omelette", "Mushrooms")],
    quantity: 1,
    note: "",
  };
  const chechebsaLine = { dishId: dish(before, "Chechebsa").id, dishName: "Chechebsa", choices: [], quantity: 1, note: "" };

  await publishMenu(s.owner.actor, {
    brandId: s.brand.id,
    menu: {
      sections: [
        {
          name: "Breakfast",
          dishes: [
            {
              dishId: omelette.id,
              name: "Omelette",
              priceSantim: 24_000,
              optionGroups: [
                {
                  optionGroupId: omelette.optionGroups[0].id,
                  name: "Extras",
                  kind: "add_extras",
                  choices: [{ choiceId: cheese.id, name: "Cheese", priceChangeSantim: 4_000 }],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const after = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;

  expect(priceDraftLine(after, omeletteLine).problems).toEqual([
    { kind: "choice_gone", choiceId: mushrooms.id, choiceName: "Mushrooms" },
  ]);
  expect(priceDraftLine(after, chechebsaLine)).toEqual({
    dish: null,
    unitPriceSantim: null,
    totalSantim: null,
    problems: [{ kind: "dish_gone" }],
  });
});

test("a line orders 1 to 99 portions and carries a note of up to 140 characters", async () => {
  const menu = await publishedCafeMenu();
  const line = { dishId: dish(menu, "Chechebsa").id, dishName: "Chechebsa", choices: [], quantity: 1, note: "" };

  expect(priceDraftLine(menu, { ...line, quantity: 99, note: "x".repeat(140) }).problems).toEqual([]);
  expect(priceDraftLine(menu, { ...line, quantity: 0 }).problems).toEqual([{ kind: "quantity_out_of_range" }]);
  expect(priceDraftLine(menu, { ...line, quantity: 100 }).problems).toEqual([{ kind: "quantity_out_of_range" }]);
  expect(priceDraftLine(menu, { ...line, quantity: 1.5 }).problems).toEqual([{ kind: "quantity_out_of_range" }]);
  expect(priceDraftLine(menu, { ...line, note: "x".repeat(141) }).problems).toEqual([{ kind: "note_too_long" }]);
});

test("the Draft counts its dishes and totals the lines that can be sent, flagging the rest", async () => {
  const menu = await publishedCafeMenu();
  const omelette = { dishId: dish(menu, "Omelette").id, dishName: "Omelette", choices: [choice(menu, "Omelette", "Cheese")], quantity: 2, note: "" };
  const chechebsa = { dishId: dish(menu, "Chechebsa").id, dishName: "Chechebsa", choices: [], quantity: 1, note: "" };
  const goneDish = { dishId: crypto.randomUUID(), dishName: "Firfir", choices: [], quantity: 1, note: "" };

  const draft = priceDraft(menu, [omelette, chechebsa, goneDish]);

  // 2 × 280 ETB + 1 × 230 ETB. The Firfir line needs the guest's attention and is not counted.
  expect(draft).toMatchObject({ dishCount: 4, totalSantim: 79_000, linesNeedingAttention: 1 });
  expect(draft.lines.map((line) => line.totalSantim)).toEqual([56_000, 23_000, null]);
});

test("a choose-one group accepts only one choice", async () => {
  const menu = await publishedCafeMenu();

  const priced = priceDraftLine(menu, {
    dishId: dish(menu, "Tuna Sandwich").id,
    dishName: "Tuna Sandwich",
    choices: [choice(menu, "Tuna Sandwich", "Plain"), choice(menu, "Tuna Sandwich", "Whole wheat")],
    quantity: 1,
    note: "",
  });

  expect(priced.problems).toEqual([
    { kind: "too_many_choices", optionGroupId: dish(menu, "Tuna Sandwich").optionGroups[0].id, optionGroupName: "Bagel" },
  ]);
});
