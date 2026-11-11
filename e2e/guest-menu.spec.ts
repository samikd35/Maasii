import { expect, test } from "@playwright/test";
import { publishMenu } from "@/core";
import { LANCHA_LINK_TOKEN } from "../scripts/seed/bilos";
import { SABA_LINK_TOKEN } from "../scripts/seed/saba";
import { scenario } from "../tests/support/scenario";

const bilosMenuLink = `/v/${LANCHA_LINK_TOKEN}`;

test("a guest opening Bilo's Venue Link sees the logo, section chips and dish rows", async ({ page }) => {
  await page.goto(bilosMenuLink);

  await expect(page.getByRole("banner").getByRole("img", { name: "Bilo's Pastry" })).toBeVisible();

  const chips = page.getByRole("navigation", { name: "Menu sections" }).getByRole("link");
  await expect(chips).toHaveText(["Breakfast", "Sandwiches & Wraps", "Pastries", "Cakes", "Coffee & Tea", "Cold Drinks"]);

  const omelette = page.getByRole("listitem").filter({ hasText: "Omelette" });
  await expect(omelette.getByRole("heading", { name: "Omelette" })).toBeVisible();
  await expect(omelette).toContainText("Start with our classic omelette and add your choice of extras");
  await expect(omelette.getByTestId("price")).toHaveText("240 ETB");
});

test("each seeded Brand shows its own artwork, display font and readable colours", async ({ page }) => {
  await page.goto(bilosMenuLink);

  const heading = page.getByRole("heading", { level: 1 });
  const brand = page.getByRole("banner");
  const language = brand.getByRole("button", { name: "EN", exact: true });
  const cover = page.locator("main img");
  await expect(cover).toHaveAttribute("src", "/brands/bilos/almond-cake.webp");
  await expect.poll(() => cover.evaluate((photo) => (photo as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(brand).toHaveCSS("border-top-color", "rgb(236, 103, 40)");
  const bilosColour = await heading.evaluate((el) => getComputedStyle(el).color);
  const bilosFont = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(bilosColour).not.toBe("rgb(236, 103, 40)");
  await expect(language).toHaveCSS("background-color", bilosColour);

  await page.getByRole("button", { name: "Omelette" }).click();
  await expect(page.getByRole("button", { name: "Add to order" })).toHaveCSS("background-color", bilosColour);
  await page.getByRole("button", { name: "Add to order" }).click();
  await expect(page.getByRole("button", { name: /Your Draft/ })).toHaveCSS("background-color", bilosColour);

  await page.goto(`/v/${SABA_LINK_TOKEN}`);
  await expect(brand.getByText("Saba House")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buna" })).toBeVisible();
  await expect(brand).toHaveCSS("border-top-color", "rgb(86, 143, 105)");
  const sabaColour = await heading.evaluate((el) => getComputedStyle(el).color);
  expect(sabaColour).not.toBe(bilosColour);
  await expect(language).toHaveCSS("background-color", sabaColour);
  expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).not.toBe(bilosFont);
});

test("dish prices line up in one right-aligned column", async ({ page }) => {
  await page.goto(bilosMenuLink);

  const rows = page.getByRole("region", { name: "Breakfast" }).getByRole("listitem");
  const rowBox = (await rows.first().boundingBox())!;
  const priceRightEdges = await rows.getByTestId("price").evaluateAll((prices) =>
    prices.map((price) => Math.round(price.getBoundingClientRect().right)),
  );

  expect(new Set(priceRightEdges).size).toBe(1);
  expect(Math.abs(priceRightEdges[0] - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(24);
});

test("a section chip jumps to its section", async ({ page }) => {
  await page.goto(bilosMenuLink);
  const cakes = page.getByRole("heading", { name: "Cakes", level: 2 });
  await expect(cakes).not.toBeInViewport();

  await page.getByRole("navigation", { name: "Menu sections" }).getByRole("link", { name: "Cakes" }).click();

  await expect(cakes).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Opera Cake" })).toBeInViewport();
});

test("the menu is server-rendered and readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(bilosMenuLink);

  await expect(page.getByRole("heading", { name: "Tiramisu" })).toBeVisible();
  await context.close();
});

test("the menu is printed in ink on warm paper with touch targets of at least 44 by 44 pixels", async ({ page }) => {
  await page.goto(bilosMenuLink);

  const colours = await page.locator("body").evaluate((body) => {
    const style = getComputedStyle(body);
    return { background: style.backgroundColor, text: style.color };
  });
  expect(colours).toEqual({ background: "rgb(251, 247, 240)", text: "rgb(28, 25, 23)" });

  const targets = page.locator("a, button, input:not([type=hidden]), select, textarea, [role=button]");
  const sizes = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { label: element.textContent?.trim(), width: box.width, height: box.height };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, `${size.label} is too narrow`).toBeGreaterThanOrEqual(44);
    expect(size.height, `${size.label} is too short`).toBeGreaterThanOrEqual(44);
  }
});

test("publishing a new Menu version changes what guests see", async ({ page }) => {
  const s = await scenario().brand("Bilo's Pastry").venue("Sarbet").publishedMenu().build();
  await page.goto(`/v/${s.venue.linkToken}`);
  await expect(page.getByRole("heading", { name: "Chechebsa" })).toBeVisible();

  await publishMenu(s.owner.actor, {
    brandId: s.brand.id,
    menu: {
      sections: [
        {
          name: { en: "Pastries", am: "ፓስትሪዎች" },
          dishes: [
            {
              name: { en: "Jam Tart", am: "የጃም ታርት" },
              description: { en: "Sweet, tangy jam", am: "ጣፋጭ እና ኮምጠጥ ያለ ጃም" },
              priceSantim: 11_000,
            },
          ],
        },
      ],
    },
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Jam Tart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chechebsa" })).toHaveCount(0);
});

test("an unknown Venue Link shows a friendly not-found page", async ({ page }) => {
  const response = await page.goto("/v/no-such-venue");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We can't find this menu" })).toBeVisible();
});
