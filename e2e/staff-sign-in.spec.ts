import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { acceptInvitation, createWaiterJoinCode, inviteManager, publicActor } from "@/core";
import { LANCHA_LINK_TOKEN } from "../scripts/seed/bilos";
import { scenario } from "../tests/support/scenario";
import { createPlatformAdmin, TEST_PASSWORD, uniqueEmail, uniquePhone } from "../tests/support/users";

async function signIn(page: Page, contact: string, password: string) {
  await page.goto("/sign-in");
  await chooseEnglish(page);
  await page.getByLabel("Email or phone").fill(contact);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function chooseEnglish(page: Page) {
  const button = page.getByRole("button", { name: "EN", exact: true });
  if ((await button.getAttribute("aria-pressed")) === "false") await button.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

/** Opens an invitation link on a new phone and accepts it with a password. */
async function acceptOnNewPhone(browser: Browser, link: string, password: string): Promise<Page> {
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.goto(link);
  await chooseEnglish(page);
  await page.getByLabel("Choose a password").fill(password);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  return page;
}

test("staff screens default to Amharic and remember their own language choice", async ({ page }) => {
  const venueLink = `/v/${LANCHA_LINK_TOKEN}`;
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "ወደ Maasii ይግቡ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await chooseEnglish(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to Maasii" })).toBeVisible();

  await page.goto(venueLink);
  await expect(page.getByRole("heading", { name: "Our menu" })).toBeVisible();
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ምናሌያችን" })).toBeVisible();
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Maasii" })).toBeVisible();
});

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

test("an Owner creates a Venue, sets up its Tables, downloads its Venue Link and QR image and invites its Manager", async ({ page, browser }) => {
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
  const linkInput = venueLink.getByLabel("Venue Link", { exact: true });
  await expect(linkInput).toHaveValue(/\/v\/bilos-pastry-bole-[a-z0-9]{4}$/);
  const [linkDownload] = await Promise.all([
    page.waitForEvent("download"),
    venueLink.getByRole("link", { name: "Download Venue Link" }).click(),
  ]);
  expect(linkDownload.suggestedFilename()).toMatch(/^bilos-pastry-bole-[a-z0-9]{4}-link\.txt$/);
  expect((await readFile(await linkDownload.path(), "utf8")).trim()).toBe(await linkInput.inputValue());
  await expect(venueLink.getByRole("img", { name: "QR code for the Bole Venue Link" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    venueLink.getByRole("link", { name: "Download QR image" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bilos-pastry-bole-[a-z0-9]{4}-qr\.png$/);
  expect(await download.failure()).toBeNull();

  const managers = page.getByRole("region", { name: "Managers" });
  await managers.getByLabel("Name").fill("Hana");
  await managers.getByLabel("Email or phone").fill(managerPhone);
  await managers.getByRole("button", { name: "Invite manager" }).click();
  const link = await managers.getByLabel("Invitation link").inputValue();

  const hana = await acceptOnNewPhone(browser, link, "hana-at-bole-2026");
  await hana.getByRole("link", { name: /Bole/ }).click();
  await expect(hana.getByRole("heading", { name: "Bole", level: 1 })).toBeVisible();
  const managerTables = hana.getByRole("region", { name: "Tables" });
  await expect(managerTables.getByRole("listitem")).toHaveCount(4);
  await managerTables.getByLabel("From table").fill("5");
  await managerTables.getByRole("button", { name: "Add tables" }).click();
  await expect(managerTables.getByRole("listitem")).toHaveCount(5);
  await expect(hana.getByRole("link", { name: "Download Venue Link" })).toBeVisible();
  await expect(hana.getByRole("link", { name: "Download QR image" })).toBeVisible();
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
  await page.setViewportSize({ width: 320, height: 720 });
  const s = await scenario().brand("Bilo's Pastry").venue("Lancha", { tables: 16 }).manager("Hana").build();
  const admin = await createPlatformAdmin();
  const { token } = await inviteManager(s.owner.actor, { venueId: s.venue.id, name: "Selam", contact: uniqueEmail("selam") });

  const screens: { who: { email: string; password: string }; paths: string[] }[] = [
    { who: { email: "", password: "" }, paths: ["/sign-in", `/invite/${token}`] },
    { who: s.owner, paths: ["/manage", `/manage/venues/${s.venue.id}`] },
    { who: admin, paths: ["/admin", `/admin/brands/${s.brand.id}`] },
  ];
  for (const { who, paths } of screens) {
    if (who.email) {
      await signIn(page, who.email, who.password);
      await expect(page).toHaveURL(/\/manage$/);
      await page.getByRole("button", { name: "አማ", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "am");
    }
    for (const path of paths) {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "am");
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
    if (who.email) {
      await page.getByRole("button", { name: "ይውጡ", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
    }
  }
});

test("a Manager enrolls a Waiter by QR and removes their access on two phones", async ({ page, browser }) => {
  const s = await scenario().venue("Lancha").manager("Hana").publishedMenu().build();
  await signIn(page, s.managers.Hana.email, s.managers.Hana.password);
  await page.getByRole("link", { name: /Lancha/ }).click();
  const waiters = page.getByRole("region", { name: "Waiters" });
  const qr = waiters.getByRole("img", { name: "Waiter join QR" });
  const showQr = waiters.getByRole("button", { name: "Show join QR" });
  await showQr.click();
  await expect(qr).toBeVisible();
  const firstImage = (await qr.getAttribute("src"))!;

  const firstPhone = await browser.newContext({ ...test.info().project.use });
  const first = await firstPhone.newPage();
  const firstUrl = decodeJoinQr(firstImage);
  await first.goto(firstUrl);
  await expect(first.locator("html")).toHaveAttribute("lang", "am");
  await chooseEnglish(first);
  await first.getByLabel("Name").fill("Sam");
  await first.getByLabel("Choose a 4-digit PIN").fill("0427");
  await first.getByRole("button", { name: "Join venue" }).click();
  await expect(first.getByRole("heading", { level: 1 })).toHaveText("Lancha");
  for (const name of ["Omelette", "ኦምሌት"]) {
    await expect(first.getByText(name, { exact: true })).toBeVisible();
  }

  const storage = await firstPhone.storageState();
  await firstPhone.close();
  // Reopen the browser with its persistent cookies, leaving the previous unlock behind.
  const reopenedPhone = await browser.newContext({
    ...test.info().project.use,
    storageState: { ...storage, cookies: storage.cookies.filter(({ expires }) => expires > 0) },
  });
  const reopened = await reopenedPhone.newPage();
  await reopened.goto(new URL("/staff", firstUrl).toString());
  await expect(reopened.getByRole("heading", { name: "Unlock Maasii" })).toBeVisible();
  await expect(reopened.getByText("Omelette", { exact: true })).toHaveCount(0);
  await reopened.getByLabel("PIN", { exact: true }).fill("1111");
  await reopened.getByRole("button", { name: "Unlock" }).click();
  await expect(reopened.getByRole("main").getByRole("alert")).toHaveText("That PIN is not right.");
  await reopened.getByLabel("PIN", { exact: true }).fill("0427");
  await reopened.getByRole("button", { name: "Unlock" }).click();
  await expect(reopened.getByRole("heading", { level: 1 })).toHaveText("Lancha");

  const secondPhone = await browser.newContext({ ...test.info().project.use });
  const second = await secondPhone.newPage();
  await second.goto(firstUrl);
  await chooseEnglish(second);
  await expect(second.getByRole("main").getByRole("alert")).toContainText("already been used");
  await second.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("lang", "am");

  await page.reload();
  await waiters.getByLabel("Waiter to connect").selectOption({ label: "Sam" });
  await showQr.click();
  await expect(qr).toBeVisible();
  await second.goto(decodeJoinQr((await qr.getAttribute("src"))!));
  await expect(second.locator("html")).toHaveAttribute("lang", "am");
  await second.getByLabel("ባለ 4 አሃዝ PIN ይምረጡ").fill("1111");
  await second.getByRole("button", { name: "ቦታውን ይቀላቀሉ" }).click();
  // Sam's English preference follows their account, even though this phone used Amharic.
  await expect(second.getByRole("heading", { level: 1 })).toHaveText("Lancha");
  await expect(second.locator("html")).toHaveAttribute("lang", "en");

  await waiters.getByRole("button", { name: "Remove Sam" }).click();
  await expect(waiters.getByRole("button", { name: "Remove Sam" })).toHaveCount(0);
  for (const phone of [reopened, second]) {
    await phone.reload();
    await expect(phone.getByRole("main").getByRole("alert")).toContainText(/fresh join QR|አዲስ የመቀላቀያ QR/);
    await expect(phone.getByText("Omelette", { exact: true })).toHaveCount(0);
  }
  await reopenedPhone.close();
  await secondPhone.close();
});

test("an expired Waiter join QR tells the phone to ask the Manager for a new code", async ({ page, baseURL }) => {
  const s = await scenario().build();
  const now = new Date(Date.now() - 6 * 60 * 1000);
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl: baseURL! }, { now });
  await page.goto(url);
  await chooseEnglish(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("has expired");
  await expect(page.getByLabel("Choose a 4-digit PIN")).toHaveCount(0);
});

function decodeJoinQr(src: string): string {
  const { data, width, height } = PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(data), width, height);
  expect(decoded?.data).toMatch(/\/join\/[\w-]+$/);
  return decoded!.data;
}
