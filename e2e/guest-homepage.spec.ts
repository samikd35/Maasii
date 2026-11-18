import { expect, test } from "@playwright/test";
import { scenario } from "../tests/support/scenario";

test("an existing Venue Link offers four destinations without ordering or JavaScript", async ({ browser }) => {
  const s = await scenario().brand("Buna House").venue("Lancha").build();
  const root = `/v/${s.venue.linkToken}`;
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-US" });
  try {
    const page = await context.newPage();
    await page.goto(root);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Venue pages" });
    await expect(nav.getByRole("link")).toHaveText(["Home", "Menu", "Your table", "More"]);
    for (const [label, path] of [["Payment details", "payment"], ["Private feedback", "feedback"], ["Social media", "social"]]) {
      await nav.getByRole("link", { name: "More", exact: true }).click();
      await page.getByRole("main").getByRole("link", { name: label, exact: false }).click();
      await expect(page).toHaveURL((url) => url.pathname === `${root}/${path}`);
      await expect(nav.getByRole("link", { name: "More", exact: true })).toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: "Home", exact: true }).click();
    }
    expect((await context.cookies()).filter(({ name }) => name.startsWith("mx_guest_session"))).toEqual([]);
  } finally {
    await context.close();
  }
});

test("keyboard navigation preserves a Draft when the browser will not write it to storage", async ({ page }) => {
  const s = await scenario().venue("Lancha").venue("Bole").publishedMenu().build();
  const root = `/v/${s.venue.linkToken}`;
  await page.addInitScript(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("maasii:draft:")) throw new DOMException("Denied", "SecurityError");
      save.call(this, key, value);
    };
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(root);
  const nav = page.getByRole("navigation", { name: "Venue pages" });
  await nav.getByRole("link", { name: "Menu", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Our menu" })).toBeVisible();
  await page.getByRole("button", { name: "Choose Omelette", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Note for the kitchen").fill("Less salt, please");
  await sheet.getByRole("button", { name: "Add to order" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);

  await nav.getByRole("link", { name: "More", exact: true }).click();
  await page.getByRole("main").getByRole("link", { name: /Payment details/ }).click();
  await expect(page.getByRole("heading", { name: "Payment details" })).toBeVisible();
  await nav.getByRole("link", { name: "More", exact: true }).click();
  await page.getByRole("main").getByRole("link", { name: /Social media/ }).click();
  await expect(page).toHaveURL((url) => url.pathname === `${root}/social`);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === `${root}/more`);
  await nav.getByRole("link", { name: "Home", exact: true }).click();

  const resume = page.getByRole("link", { name: "Continue your order", exact: true });
  await expect(resume).toBeVisible();
  await resume.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === `${root}/menu` && url.searchParams.get("view") === "order");
  await expect(sheet.getByText("“Less salt, please”", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Omelette", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();

  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(page.getByRole("link", { name: "ትዕዛዝዎን ይቀጥሉ" })).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.goto(`/v/${s.venues.Bole.linkToken}`);
  await expect(page.getByText("Bole", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ትዕዛዝዎን ይቀጥሉ" })).toHaveCount(0);
});
