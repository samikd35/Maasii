import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { scenario } from "../tests/support/scenario";
import type { TestUser } from "../tests/support/users";

const artwork = (name: string) => resolve("public/brands/bilos", name);
const loadedImage = (img: Element) => (img as HTMLImageElement).naturalWidth;

async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Email or phone").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manage$/);
}

test("an Owner previews and saves artwork and readable colours for every Venue", async ({ page, browser }) => {
  const s = await scenario().brand("Bole Coffee").venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const guest = await browser.newPage({ ...test.info().project.use });
  const guestHeading = guest.getByRole("heading", { name: "Our menu" });
  const guestHeader = guest.getByRole("banner");

  await signIn(page, s.owner);
  const brandingLink = page.getByRole("link", { name: "Branding", exact: true });
  await expect(brandingLink).toBeVisible();
  await brandingLink.click();
  const preview = page.getByRole("region", { name: "Guest menu preview" });
  const previewHeading = preview.getByRole("heading", { name: "Our menu" });
  const previewHeader = preview.locator("header");

  const oldFont = await previewHeading.evaluate((heading) => getComputedStyle(heading).fontFamily);
  await page.getByLabel("Brand colour").fill("#ec6728");
  await page.getByLabel("Display font").selectOption("noto-serif-ethiopic");
  await page.getByLabel("Logo", { exact: true }).setInputFiles(artwork("logo.webp"));
  await page.getByLabel("Cover photo").setInputFiles(artwork("almond-cake.webp"));

  await expect(page.getByText("Your colour #EC6728")).toBeVisible();
  await expect(page.getByText(/^Readable shade #/)).toBeVisible();
  await expect(page.getByText(/darker shade for text and buttons/)).toBeVisible();
  await expect(previewHeader).toHaveCSS("border-top-color", "rgb(236, 103, 40)");
  await expect(previewHeading).not.toHaveCSS("font-family", oldFont);
  await expect(preview.getByRole("heading", { name: "Macchiato" })).toBeVisible();
  const readable = await previewHeading.evaluate((heading) => getComputedStyle(heading).color);
  await expect(preview.getByText(/Your Draft/).locator("../..")).toHaveCSS("background-color", readable);
  await expect.poll(() => preview.getByRole("img", { name: "Bole Coffee" }).evaluate(loadedImage)).toBeGreaterThan(0);
  await expect.poll(() => preview.locator('img[alt=""]').evaluate(loadedImage)).toBeGreaterThan(0);

  await guest.goto(`/v/${s.venue.linkToken}`);
  await expect(guestHeader).not.toHaveCSS("border-top-color", "rgb(236, 103, 40)");
  await expect(guestHeader.getByRole("img")).toHaveCount(0);

  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("status")).toHaveText("Branding saved at every venue.");

  for (const venue of Object.values(s.venues)) {
    await guest.goto(`/v/${venue.linkToken}`);
    await expect(guestHeader).toHaveCSS("border-top-color", "rgb(236, 103, 40)");
    await expect(guestHeading).toHaveCSS("color", readable);
    await expect(guestHeading).toHaveCSS("font-family", await previewHeading.evaluate((el) => getComputedStyle(el).fontFamily));
    await expect.poll(() => guestHeader.getByRole("img", { name: "Bole Coffee" }).evaluate(loadedImage)).toBeGreaterThan(0);
    await expect.poll(() => guest.locator('main img[alt=""]').evaluate(loadedImage)).toBeGreaterThan(0);
  }

  await signIn(guest, s.managers.Hana);
  await expect(guest.getByRole("link", { name: "Branding", exact: true })).toHaveCount(0);
  await guest.goto(page.url());
  await expect(guest.getByRole("heading", { name: "We couldn't find what you were looking for." })).toBeVisible();
  await guest.close();
});
