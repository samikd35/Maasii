import { expect, test, type Page } from "@playwright/test";
import { getPublishedMenu, publicActor, publishMenu, type MenuInput } from "@/core";
import { LANCHA_LINK_TOKEN } from "../scripts/seed/bilos";
import { scenario } from "../tests/support/scenario";

const bilosMenuLink = `/v/${LANCHA_LINK_TOKEN}`;

const tunaAndJuice: MenuInput = {
  sections: [
    {
      name: "Sandwiches",
      dishes: [
        {
          name: "Tuna Sandwich",
          priceSantim: 36_000,
          optionGroups: [
            { name: "Bagel", kind: "choose_one", required: true, choices: [{ name: "Plain" }, { name: "Rye" }] },
          ],
        },
      ],
    },
    { name: "Drinks", dishes: [{ name: "Mango Juice", priceSantim: 14_000, fasting: true }] },
  ],
};

function dishSheet(page: Page) {
  return page.getByRole("dialog");
}

async function openDish(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(dishSheet(page).getByRole("heading", { name, level: 2 })).toBeVisible();
}

test("a guest adds a dish with extras, a note and a quantity, and the Draft survives a reload", async ({ page }) => {
  await page.goto(bilosMenuLink);

  await openDish(page, "Omelette");
  const sheet = dishSheet(page);
  await expect(sheet).toContainText("Start with our classic omelette");
  await expect(sheet.getByTestId("price")).toHaveText("240 ETB");

  await sheet.getByRole("checkbox", { name: /Cheese/ }).check();
  await expect(sheet.getByTestId("price")).toHaveText("280 ETB");
  await sheet.getByRole("checkbox", { name: /Mushrooms/ }).check();
  await sheet.getByLabel("Note for the kitchen").fill("No salt, please");
  await sheet.getByRole("button", { name: "One more" }).click();
  await expect(sheet.getByTestId("price")).toHaveText("630 ETB");
  await sheet.getByRole("button", { name: "Add to order" }).click();

  const slip = page.getByRole("button", { name: /Your Draft/ });
  await expect(slip).toContainText("2 dishes");
  await expect(slip).toContainText("630 ETB");

  await page.reload();

  await expect(slip).toContainText("2 dishes");
  await expect(slip).toContainText("630 ETB");
  await slip.click();
  const line = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Omelette" });
  await expect(line).toContainText("Cheese, Mushrooms");
  await expect(line).toContainText("No salt, please");
  await expect(line.getByTestId("quantity")).toHaveText("2");
});

test("Add to order waits until every required choose-one group has a choice, and says what is missing", async ({ page }) => {
  await page.goto(bilosMenuLink);

  await openDish(page, "Tuna Sandwich");
  const sheet = dishSheet(page);
  const add = sheet.getByRole("button", { name: "Add to order" });
  await expect(add).toBeDisabled();
  await expect(sheet).toContainText("Still to choose: Bagel");

  await sheet.getByRole("radio", { name: /Whole wheat/ }).check();

  await expect(add).toBeEnabled();
  await expect(sheet).not.toContainText("Still to choose");
  await expect(sheet.getByTestId("price")).toHaveText("400 ETB");
});

test("the dish sheet shows the photo and the fasting label when a dish has them", async ({ page }) => {
  await page.goto(bilosMenuLink);

  await openDish(page, "Almond Cake");
  await expect(dishSheet(page).locator("img")).toHaveAttribute("src", "/brands/bilos/almond-cake.webp");
  await dishSheet(page).getByRole("button", { name: "Close" }).click();

  await openDish(page, "Vegan Oatmeal");
  await expect(dishSheet(page).getByText("Fasting", { exact: true })).toBeVisible();
  await expect(dishSheet(page).locator("img")).toHaveCount(0);
});

test("a guest changes quantities, edits choices and notes, and removes dishes in the Draft", async ({ page }) => {
  await page.goto(bilosMenuLink);
  await openDish(page, "Macchiato");
  await dishSheet(page).getByRole("button", { name: "Add to order" }).click();
  await openDish(page, "Cappuccino");
  await dishSheet(page).getByRole("button", { name: "Add to order" }).click();
  const slip = page.getByRole("button", { name: /Your Draft/ });
  await expect(slip).toContainText("2 dishes");
  await expect(slip).toContainText("160 ETB");

  await slip.click();
  const cappuccino = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Cappuccino" });
  await cappuccino.getByRole("button", { name: "One more" }).click();
  await expect(page.getByRole("dialog")).toContainText("Total · 3 dishes");

  await cappuccino.getByRole("button", { name: "Edit" }).click();
  await dishSheet(page).getByRole("checkbox", { name: /Extra shot/ }).check();
  await dishSheet(page).getByLabel("Note for the kitchen").fill("Very hot");
  await expect(dishSheet(page).getByTestId("price")).toHaveText("240 ETB");
  await dishSheet(page).getByRole("button", { name: "Save changes" }).click();

  await expect(cappuccino).toContainText("Extra shot");
  await expect(cappuccino).toContainText("Very hot");
  await expect(cappuccino.getByTestId("price")).toHaveText("240 ETB");

  await page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Macchiato" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(slip).toContainText("2 dishes");
  await expect(slip).toContainText("240 ETB");

  await slip.click();
  await cappuccino.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(slip).toHaveCount(0);
});

test("the Draft keeps working without signal and is still there when it returns", async ({ page, context }) => {
  await page.goto(bilosMenuLink);

  await context.setOffline(true);
  await openDish(page, "Bread Spread");
  await dishSheet(page).getByRole("radio", { name: /Croissant/ }).check();
  await dishSheet(page).getByRole("button", { name: "Add to order" }).click();
  const slip = page.getByRole("button", { name: /Your Draft/ });
  await expect(slip).toContainText("1 dish");
  await expect(slip).toContainText("220 ETB");

  await context.setOffline(false);
  await page.reload();

  await expect(slip).toContainText("1 dish");
  await slip.click();
  await expect(page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Bread Spread" })).toContainText("Croissant");
});

test("a Draft line whose dish or choice left the published Menu tells the guest which line needs attention", async ({ page }) => {
  const s = await scenario().publishedMenu(tunaAndJuice).build();
  const published = (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!;
  const tuna = published.sections[0].dishes[0];
  const [bagel] = tuna.optionGroups;

  await page.goto(`/v/${s.venue.linkToken}`);
  await openDish(page, "Tuna Sandwich");
  await dishSheet(page).getByRole("radio", { name: "Rye" }).check();
  await dishSheet(page).getByRole("button", { name: "Add to order" }).click();
  await openDish(page, "Mango Juice");
  await dishSheet(page).getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByRole("button", { name: /Your Draft/ })).toContainText("500 ETB");

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
              priceSantim: 36_000,
              optionGroups: [
                {
                  optionGroupId: bagel.id,
                  name: "Bagel",
                  kind: "choose_one",
                  required: true,
                  choices: [{ choiceId: bagel.choices[0].id, name: "Plain" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  await page.reload();

  const slip = page.getByRole("button", { name: /Your Draft/ });
  await expect(slip).toContainText("2 dishes");
  await expect(slip).toContainText("2 dishes need attention");
  await slip.click();
  const tunaLine = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Tuna Sandwich" });
  await expect(tunaLine).toContainText("Rye");
  await expect(tunaLine).toContainText("Rye is no longer offered.");
  const juiceLine = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Mango Juice" });
  await expect(juiceLine).toContainText("This dish is no longer on the menu.");

  await tunaLine.getByRole("button", { name: "Edit" }).click();
  await expect(dishSheet(page)).toContainText("Rye is no longer offered.");
  await expect(dishSheet(page).getByRole("button", { name: "Save changes" })).toBeDisabled();
  await dishSheet(page).getByRole("radio", { name: "Plain" }).check();
  await dishSheet(page).getByRole("button", { name: "Save changes" }).click();
  await expect(tunaLine).not.toContainText("no longer offered");
  await expect(tunaLine.getByTestId("price")).toHaveText("360 ETB");
  await expect(page.getByRole("dialog")).toContainText("1 dish needs attention");
});
