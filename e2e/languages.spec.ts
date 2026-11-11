import { expect, test, type Page } from "@playwright/test";
import { LANCHA_LINK_TOKEN } from "../scripts/seed/bilos";
import { SABA_LINK_TOKEN } from "../scripts/seed/saba";
import { scenario } from "../tests/support/scenario";

const bilosMenuLink = `/v/${LANCHA_LINK_TOKEN}`;
const sabaMenuLink = `/v/${SABA_LINK_TOKEN}`;

const sectionChips = (page: Page) => page.getByRole("navigation", { name: /Menu sections|የምናሌ ክፍሎች/ }).getByRole("link");
const dishRow = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });

test("a guest switches the menu to Amharic and back, and the choice survives a reload", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-maasii-test-now": "2026-10-08T12:00:00Z" });
  await page.goto(bilosMenuLink);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our menu");

  await page.getByRole("button", { name: "አማ" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(sectionChips(page)).toHaveText(["ቁርስ", "ሳንድዊቾች እና ራፖች", "ፓስትሪዎች", "ኬኮች", "ቡና እና ሻይ", "ቀዝቃዛ መጠጦች"]);
  const omelette = dishRow(page, "ኦምሌት");
  await expect(omelette).toContainText("በእኛ ክላሲክ ኦምሌት ይጀምሩ፣ የሚፈልጉትን ተጨማሪ ይምረጡ");
  await expect(omelette.getByTestId("price")).toHaveText("240 ብር");
  await expect(page.getByRole("button", { name: "አማ" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");
  await expect(page.getByRole("heading", { name: "ኦምሌት" })).toBeVisible();

  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our menu");
  await expect(dishRow(page, "Omelette").getByTestId("price")).toHaveText("240 ETB");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Omelette" })).toBeVisible();
});

test("switching language keeps the guest's place on the page", async ({ page }) => {
  await page.goto(bilosMenuLink);
  await sectionChips(page).filter({ hasText: "Cakes" }).click();
  await expect(page.getByRole("heading", { name: "Opera Cake" })).toBeInViewport();

  const amharic = page.getByRole("button", { name: "አማ" });
  await expect(amharic).toBeInViewport();
  await amharic.click();

  await expect(page.getByRole("heading", { name: "ኦፔራ ኬክ" })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "ኬኮች", level: 2 })).toBeInViewport();
});

test("the language choice applies on the next visit to any venue", async ({ page }) => {
  const s = await scenario().brand("Saba House").venue("Bole").publishedMenu().build();
  await page.goto(bilosMenuLink);
  await page.getByRole("button", { name: "አማ" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");

  await page.goto(`/v/${s.venue.linkToken}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");
  await expect(page.getByRole("heading", { name: "ኦምሌት" })).toBeVisible();
});

test("the switch works without JavaScript too", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(bilosMenuLink);

  await page.getByRole("button", { name: "አማ" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");
  await expect(page.getByRole("heading", { name: "ኦምሌት" })).toBeVisible();
  await context.close();
});

test.describe("on a phone set to Amharic", () => {
  test.use({ locale: "am-ET" });

  test("the menu opens in Amharic", async ({ page }) => {
    await page.goto(bilosMenuLink);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");
    await expect(page.getByRole("heading", { name: "ጨጨብሳ" })).toBeVisible();
  });

  test("no interface or Menu text is left in English, apart from names", async ({ page }) => {
    await page.goto(bilosMenuLink);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");

    const text = await page.evaluate(() => {
      const switcher = document.querySelector('[role="group"][aria-label="ቋንቋ"]');
      const labels = [...document.querySelectorAll("[aria-label], [alt], [title]")]
        .filter((element) => !switcher?.contains(element))
        .flatMap((element) => ["aria-label", "alt", "title"].map((name) => element.getAttribute(name) ?? ""));
      switcher?.remove();
      return [document.title, document.body.innerText, ...labels].join("\n");
    });

    const withoutNames = text.replaceAll("Bilo's Pastry", "").replaceAll("Lancha", "").replaceAll("Maasii", "");
    expect(withoutNames).not.toMatch(/[A-Za-z]/);
  });

  for (const [link, familyName] of [[bilosMenuLink, "Noto Sans Ethiopic"], [sabaMenuLink, "Noto Serif Ethiopic"]]) {
    test(`Amharic headings and body text are set in ${familyName}`, async ({ page }) => {
      await page.goto(link);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("ምናሌያችን");
      await page.evaluate(() => document.fonts.ready);

      const cdp = await page.context().newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const { root } = await cdp.send("DOM.getDocument");
      for (const selector of ["h1", "main h3", "main li p"]) {
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
        const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
        expect(fonts, selector).toContainEqual(expect.objectContaining({ familyName, isCustomFont: true }));
      }
    });
  }

  test("the Amharic guest menu weighs under 250 KB before photos, fonts included", async ({ page }) => {
    const bytes = await weighMenu(page);
    console.log(`Amharic guest menu weight before photos: ${(bytes.total / 1024).toFixed(1)} KB`);
    expect(bytes.ethiopicFonts).toBe(1);
    expect(bytes.total).toBeLessThan(250 * 1024);
  });

  test("Saba House's Amharic menu weighs under 250 KB and downloads one Ethiopic font", async ({ page }) => {
    const bytes = await weighMenu(page, sabaMenuLink);
    console.log(`Saba House Amharic menu weight before photos: ${(bytes.total / 1024).toFixed(1)} KB`);
    expect(bytes.ethiopicFonts).toBe(1);
    expect(bytes.total).toBeLessThan(250 * 1024);
  });
});

test.describe("on a phone set to another language", () => {
  test.use({ locale: "fr-FR" });

  test("the menu opens in English", async ({ page }) => {
    await page.goto(bilosMenuLink);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our menu");
    await expect(page.getByRole("heading", { name: "Chechebsa" })).toBeVisible();
  });
});

test("the English guest menu weighs under 250 KB before photos and downloads no Ethiopic font", async ({ page }) => {
  const bytes = await weighMenu(page);
  console.log(`English guest menu weight before photos: ${(bytes.total / 1024).toFixed(1)} KB`);
  expect(bytes.fonts).toBe(0);
  expect(bytes.total).toBeLessThan(250 * 1024);
});

test("Saba House's English menu weighs under 250 KB and only downloads its Latin font", async ({ page }) => {
  const bytes = await weighMenu(page, sabaMenuLink);
  console.log(`Saba House English menu weight before photos: ${(bytes.total / 1024).toFixed(1)} KB`);
  expect(bytes.ethiopicFonts).toBe(0);
  expect(bytes.fonts).toBeGreaterThan(0);
  expect(bytes.total).toBeLessThan(250 * 1024);
});

async function weighMenu(page: Page, link = bilosMenuLink) {
  await page.setExtraHTTPHeaders({ "x-maasii-test-now": "2026-10-06T21:00:00Z" });
  const pending: Promise<{ font: boolean; size: number }>[] = [];
  page.on("requestfinished", (request) => {
    if (request.resourceType() === "image") return;
    const font = request.resourceType() === "font";
    pending.push(request.sizes().then((sizes) => ({ font, size: sizes.responseBodySize + sizes.responseHeadersSize })));
  });
  await page.goto(link, { waitUntil: "networkidle" });
  const sizes = await Promise.all(pending);
  return {
    total: sizes.reduce((total, { size }) => total + size, 0),
    fonts: sizes.filter(({ font }) => font).reduce((total, { size }) => total + size, 0),
    ethiopicFonts: await page.evaluate(() => [...document.fonts].filter((font) =>
      font.status === "loaded" && font.unicodeRange.toLowerCase().includes("u+1200"),
    ).length),
  };
}
