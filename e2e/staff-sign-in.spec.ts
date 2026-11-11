import { expect, test, type Browser, type Page } from "@playwright/test";
import { acceptInvitation, inviteManager, publicActor } from "@/core";
import { scenario } from "../tests/support/scenario";
import { createPlatformAdmin, TEST_PASSWORD, uniqueEmail, uniquePhone } from "../tests/support/users";

async function signIn(page: Page, contact: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or phone").fill(contact);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Opens an invitation link on a new phone and accepts it with a password. */
async function acceptOnNewPhone(browser: Browser, link: string, password: string): Promise<Page> {
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.goto(link);
  await page.getByLabel("Choose a password").fill(password);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  return page;
}

test("the platform admin creates a brand and invites its Owner, who accepts on their own phone", async ({ page, browser }) => {
  const admin = await createPlatformAdmin();
  const ownerEmail = uniqueEmail("selam");

  await signIn(page, admin.email, admin.password);
  await page.getByRole("link", { name: "Platform admin" }).click();
  await page.getByLabel("Brand name").fill("Kaldi's Coffee");
  await page.getByRole("button", { name: "Create brand" }).click();

  await expect(page.getByRole("heading", { name: "Kaldi's Coffee", level: 1 })).toBeVisible();
  await page.getByLabel("Name").fill("Selam");
  await page.getByLabel("Email or phone").fill(ownerEmail);
  await page.getByRole("button", { name: "Invite owner" }).click();
  const link = await page.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]+$/);
  await expect(page.getByRole("region", { name: "Waiting to accept" })).toContainText(ownerEmail);

  const owner = await acceptOnNewPhone(browser, link, "kaldi-coffee-2026");
  await expect(owner.getByRole("heading", { name: "Kaldi's Coffee" })).toBeVisible();
  await expect(owner.getByText("Owner", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Owners" })).toContainText("Selam");
});

test("an Owner creates a Venue, sets up its Tables, downloads its QR image and invites its Manager", async ({ page, browser }) => {
  const s = await scenario().brand("Bilo's Pastry").venue("Lancha", { tables: 2 }).build();
  const managerPhone = uniquePhone();

  await signIn(page, s.owner.email, s.owner.password);
  await expect(page.getByRole("link", { name: /Lancha/ })).toBeVisible();
  await page.getByLabel("Venue name").fill("Bole");
  await page.getByRole("button", { name: "Add venue" }).click();
  await page.getByRole("link", { name: /Bole/ }).click();
  await expect(page.getByRole("heading", { name: "Bole", level: 1 })).toBeVisible();

  const tables = page.getByRole("region", { name: "Tables" });
  await tables.getByLabel("From table").fill("1");
  await tables.getByLabel("To table").fill("4");
  await tables.getByRole("button", { name: "Add tables" }).click();
  await expect(tables.getByRole("listitem")).toHaveCount(4);

  const four = tables.getByRole("listitem").filter({ hasText: "Table 4" });
  await four.getByText("Change number").click();
  await four.getByLabel("New number for table 4").fill("12");
  await four.getByRole("button", { name: "Save" }).click();
  await expect(tables.getByRole("listitem").filter({ hasText: "Table 12" })).toBeVisible();

  const two = tables.getByRole("listitem").filter({ hasText: "Table 2" });
  await two.getByRole("button", { name: "Deactivate" }).click();
  await expect(two).toContainText("Not in use");
  await two.getByRole("button", { name: "Reactivate" }).click();
  await expect(two).not.toContainText("Not in use");

  const venueLink = page.getByRole("region", { name: "Venue Link" });
  await expect(venueLink.getByLabel("Venue Link")).toHaveValue(/\/v\/bilos-pastry-bole-[a-z0-9]{4}$/);
  await expect(venueLink.getByRole("img", { name: "QR code for the Bole Venue Link" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    venueLink.getByRole("link", { name: "Download QR image" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bilos-pastry-bole-[a-z0-9]{4}-qr\.png$/);

  const managers = page.getByRole("region", { name: "Managers" });
  await managers.getByLabel("Name").fill("Hana");
  await managers.getByLabel("Email or phone").fill(managerPhone);
  await managers.getByRole("button", { name: "Invite manager" }).click();
  const link = await managers.getByLabel("Invitation link").inputValue();

  const hana = await acceptOnNewPhone(browser, link, "hana-at-bole-2026");
  await hana.getByRole("link", { name: /Bole/ }).click();
  await expect(hana.getByRole("heading", { name: "Bole", level: 1 })).toBeVisible();
  await expect(hana.getByRole("region", { name: "Tables" }).getByRole("listitem")).toHaveCount(4);
  await expect(hana.getByRole("button", { name: "Invite manager" })).toHaveCount(0);
  await hana.goto("/manage");
  await expect(hana.getByRole("link", { name: /Lancha/ })).toHaveCount(0);
});

test("a Manager signs in with a local phone number and a password, and signs out", async ({ page }) => {
  const s = await scenario().brand("Bilo's Pastry").venue("Lancha", { tables: 2 }).build();
  const phone = uniquePhone();
  const { token } = await inviteManager(s.owner.actor, { venueId: s.venue.id, name: "Abebe", contact: phone });
  await acceptInvitation(publicActor, { token, password: TEST_PASSWORD });
  const localPhone = `0${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`;

  await signIn(page, localPhone, "not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: "That email, phone or password is not right." })).toBeVisible();

  await signIn(page, localPhone, TEST_PASSWORD);
  await expect(page.getByRole("link", { name: /Lancha/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/manage");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a Manager cannot open another venue's page", async ({ page }) => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana", { venue: "Bole" }).build();

  await signIn(page, s.managers.Hana.email, s.managers.Hana.password);
  await expect(page.getByRole("link", { name: /Bole/ })).toBeVisible();
  const response = await page.goto(`/manage/venues/${s.venues.Lancha.id}`);
  expect(response?.status()).toBe(404);
  const qr = await page.request.get(`/manage/venues/${s.venues.Lancha.id}/qr`);
  expect(qr.status()).toBe(404);
});

test("every management screen fits a phone, with touch targets of at least 44 by 44 pixels", async ({ page }) => {
  const s = await scenario().brand("Bilo's Pastry").venue("Lancha", { tables: 16 }).manager("Hana").build();
  const admin = await createPlatformAdmin();

  const screens: { who: { email: string; password: string }; paths: string[] }[] = [
    { who: { email: "", password: "" }, paths: ["/sign-in"] },
    { who: s.owner, paths: ["/manage", `/manage/venues/${s.venue.id}`] },
    { who: admin, paths: ["/admin", `/admin/brands/${s.brand.id}`] },
  ];
  for (const { who, paths } of screens) {
    if (who.email) await signIn(page, who.email, who.password);
    for (const path of paths) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);

      const sizes = await page.locator("a, button, input, select, summary").evaluateAll((elements) =>
        elements
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .map((element) => {
            const box = element.getBoundingClientRect();
            return { label: element.textContent?.trim() || element.getAttribute("aria-label") || element.getAttribute("name"), width: box.width, height: box.height };
          }),
      );
      for (const size of sizes) {
        expect(size.height, `${path}: ${size.label} is too short`).toBeGreaterThanOrEqual(44);
        expect(size.width, `${path}: ${size.label} is too narrow`).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
