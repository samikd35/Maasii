import { expect, test, type Page } from "@playwright/test";
import { addPaymentOption, listBrandSupportOpenings } from "@/core";
import { LANCHA_LINK_TOKEN } from "../scripts/seed/bilos";
import { scenario } from "../tests/support/scenario";
import { createPlatformAdmin } from "../tests/support/users";

async function openAdmin(page: Page, admin: { email: string; password: string }) {
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Platform admin" }).click();
}

test("the admin can open a Brand for support without getting Brand edit controls", async ({ page }) => {
  const admin = await createPlatformAdmin();
  const brandName = `Support Brand ${crypto.randomUUID().slice(0, 8)}`;
  const s = await scenario().brand(brandName).venue("Bole", { tables: 2 })
    .manager("Hana").waiter("Sam").publishedMenu().build();
  await addPaymentOption(s.owner.actor, {
    venueId: s.venue.id, kind: "bank_transfer", provider: "Support Bank",
    recipientName: "Saba House", accountOrMerchantCode: "0012345", displayOrder: 1,
  });

  await openAdmin(page, admin);
  await page.getByRole("link", { name: `${brandName} 1 venue` }).click();
  const support = page.getByRole("link", { name: "Open read-only support" });
  await expect(support).toBeVisible();
  expect(await listBrandSupportOpenings(admin.actor, { brandId: s.brand.id })).toEqual([]);
  await support.click();

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: brandName, level: 1 })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Bole" })).toBeVisible();
  await expect(main.getByText("Hana", { exact: true })).toBeVisible();
  await expect(main.getByText("Sam", { exact: true })).toBeVisible();
  await expect(main.getByText("0012345", { exact: false })).toBeVisible();
  await expect(main.locator("form")).toHaveCount(0);
  expect(await listBrandSupportOpenings(admin.actor, { brandId: s.brand.id })).toHaveLength(1);

  await page.reload();
  await expect(main.getByRole("heading", { name: brandName, level: 1 })).toBeVisible();
  expect(await listBrandSupportOpenings(admin.actor, { brandId: s.brand.id })).toHaveLength(2);
});

test("a platform admin adds, edits and removes calendar dates and a guest sees each change", async ({ page, browser }) => {
  await openAdmin(page, await createPlatformAdmin());
  await page.getByRole("link", { name: "Fasting calendar" }).click();
  const guest = await browser.newPage({ ...test.info().project.use });
  await guest.setExtraHTTPHeaders({ "x-maasii-test-now": "2041-09-02T12:00:00Z" });
  await guest.goto(`/v/${LANCHA_LINK_TOKEN}`);
  const firstSection = guest.getByRole("navigation", { name: "Menu sections" }).getByRole("link").first();
  await expect(firstSection).toHaveText("Breakfast");

  const add = page.getByRole("region", { name: "Add a calendar period" });
  await add.getByLabel("Start date").fill("2041-09-02");
  await add.getByLabel("End date").fill("2041-09-03");
  await add.getByRole("button", { name: "Add period" }).click();
  const period = page.getByRole("article").filter({ has: page.locator('time[datetime="2041-09-02"]') });
  await expect(period).toContainText("Fasting season");
  await guest.reload();
  await expect(firstSection).toHaveText("Fasting dishes");

  await period.getByText("Edit period", { exact: true }).click();
  await period.getByLabel("Period type").selectOption("exception");
  await period.getByRole("button", { name: "Save period" }).click();
  await expect(period).toContainText("Non-fasting exception");
  await guest.reload();
  await expect(firstSection).toHaveText("Breakfast");

  await period.getByRole("button", { name: "Remove period" }).click();
  await expect(period).toHaveCount(0);
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "የጾም ቀን መቁጠሪያ", level: 1 })).toBeVisible();
  await guest.close();
});
