import { expect, test } from "@playwright/test";
import { publishMenu } from "@/core";
import { LANCHA_LINK_TOKEN } from "../scripts/seed/bilos";
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

  const targets = page.locator("a, button, input, select, textarea, [role=button]");
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
        { name: "Pastries", dishes: [{ name: "Jam Tart", description: "Sweet, tangy jam", priceSantim: 11_000 }] },
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

test("the guest menu weighs under 250 KB before photos", async ({ page }) => {
  const pending: Promise<number>[] = [];
  page.on("requestfinished", (request) => {
    if (request.resourceType() === "image") return;
    pending.push(request.sizes().then((sizes) => sizes.responseBodySize + sizes.responseHeadersSize));
  });

  await page.goto(bilosMenuLink, { waitUntil: "networkidle" });
  const bytes = (await Promise.all(pending)).reduce((total, size) => total + size, 0);

  console.log(`Guest menu weight before photos: ${(bytes / 1024).toFixed(1)} KB`);
  expect(bytes).toBeLessThan(250 * 1024);
});
