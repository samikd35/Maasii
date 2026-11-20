import { expect, test, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { addPaymentOption, listPaymentOptions, updatePaymentOption } from "@/core";
import { scenario } from "../tests/support/scenario";
import type { TestUser } from "../tests/support/users";

async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manage\/(?:brands\/[^/]+|venues\/[^/]+\/floor)$/);
}

test("an Owner reviews destination changes, and a stale review cannot overwrite another edit", async ({ page, browser }) => {
  const s = await scenario().venue("Lancha").manager("Hana").build();
  await signIn(page, s.owner);
  await page.goto(`/manage/venues/${s.venue.id}/payment-options`);
  await expect(page.getByRole("link", { name: "Setup", exact: true })).toHaveAttribute("aria-current", "location");

  const add = page.getByRole("region", { name: "Add a Payment Option" });
  await add.getByLabel("Provider").fill("Test Bank");
  await add.getByLabel("Recipient name").fill("Bilo’s");
  await add.getByLabel("Account number or merchant code").fill("0012345");
  await add.getByLabel("QR image").setInputFiles({
    name: "payment.png",
    mimeType: "image/png",
    buffer: await QRCode.toBuffer("https://example.test/pay"),
  });
  const review = page.getByRole("dialog", { name: "Review Payment Option?" });
  await add.getByRole("button", { name: "Review changes" }).click();
  await expect(review).toContainText("Guests at Lancha");
  expect(await listPaymentOptions(s.owner.actor, { venueId: s.venue.id })).toHaveLength(0);
  await review.getByRole("button", { name: "Add Payment Option" }).click();

  const row = page.getByRole("article", { name: "Test Bank" });
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await row.getByText("Edit Payment Option", { exact: true }).click();

  const account = row.getByLabel("Account number or merchant code");
  const openReview = row.getByRole("button", { name: "Review changes" });
  const save = review.getByRole("button", { name: "Save Payment Option" });
  const [before] = await listPaymentOptions(s.owner.actor, { venueId: s.venue.id });
  await row.getByLabel("QR image (optional)", { exact: true }).setInputFiles({
    name: "replacement.png", mimeType: "image/png", buffer: await QRCode.toBuffer("https://example.test/replacement"),
  });
  await openReview.click();
  await expect(review.getByRole("img", { name: "Payment QR image" })).toHaveCount(2);
  await expect(review.getByRole("heading", { name: "After", exact: true })).toBeInViewport();
  await expect(review.getByRole("img", { name: "Payment QR image" }).last()).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => review.getByRole("img", { name: "Payment QR image" }).last().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await review.getByRole("button", { name: "Cancel" }).click();
  expect((await listPaymentOptions(s.owner.actor, { venueId: s.venue.id }))[0].qrImage).toBe(before.qrImage);
  await openReview.click();
  await save.click();
  await expect.poll(async () => (await listPaymentOptions(s.owner.actor, { venueId: s.venue.id }))[0].qrImage)
    .not.toBe(before.qrImage);
  await expect(account).toHaveValue("0012345");
  await account.fill("0098765");
  await openReview.click();
  await expect(review.getByText("Changed fields · Account number or merchant code", { exact: true })).toBeVisible();
  await expect(review.getByText("0012345", { exact: true })).toBeVisible();
  await expect(review.getByText("0098765", { exact: true })).toBeVisible();
  await save.click();
  await expect(row.getByText("0098765", { exact: true })).toBeVisible();

  await account.fill("0055555");
  await openReview.click();
  const [current] = await listPaymentOptions(s.owner.actor, { venueId: s.venue.id });
  await updatePaymentOption(s.owner.actor, {
    venueId: current.venueId,
    paymentOptionId: current.id,
    revision: current.revision,
    changes: { accountOrMerchantCode: "0044444" },
    destinationReviewed: true,
  });

  await save.click();
  await expect(row.getByRole("alert")).toContainText("changed while you were editing");
  await page.reload();
  await expect(row.getByText("0044444", { exact: true })).toBeVisible();
  const history = page.getByRole("region", { name: "Payment Option changes" });
  await history.getByText("Edited", { exact: true }).first().click();
  await expect(history.getByText("0098765", { exact: true }).first()).toBeVisible();
  await expect(history.getByText("0044444", { exact: true })).toBeVisible();

  const manager = await browser.newPage({ ...test.info().project.use });
  await signIn(manager, s.managers.Hana);
  await manager.goto(page.url());
  const managerRow = manager.getByRole("article", { name: "Test Bank" });
  await expect(managerRow.getByText("0044444", { exact: true })).toBeVisible();
  await expect(managerRow.getByText("Edit Payment Option", { exact: true })).toHaveCount(0);
  await expect(manager.getByRole("region", { name: "Add a Payment Option" })).toHaveCount(0);
  await expect(manager.getByRole("region", { name: "Payment Option changes" })).toHaveCount(0);
  await manager.close();

  await row.getByText("Payment option actions", { exact: true }).click();
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(review.getByText("0044444", { exact: true })).toHaveCount(2);
  await review.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Remove Payment Option" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove Payment Option" }).click();
  await expect(row).toHaveCount(0);
  await expect(history.getByText("Removed", { exact: true })).toBeVisible();
});

test("a guest can find and copy current payment details before ordering, without losing their Draft", async ({
  page, context,
}) => {
  const s = await scenario().venue("Lancha").publishedMenu().build();
  const option = await addPaymentOption(s.owner.actor, {
    venueId: s.venue.id,
    kind: "bank_transfer",
    provider: "Public Test Bank",
    recipientName: "Test Recipient",
    accountOrMerchantCode: "0012345",
    qrImage: await QRCode.toDataURL("https://example.test/pay"),
    displayOrder: 1,
    destinationReviewed: true,
  });
  const venuePath = `/v/${s.venue.linkToken}`;
  const response = await page.goto(`${venuePath}/payment`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Payment details" })).toBeVisible();
  await expect(page.getByText("Public Test Bank")).toBeVisible();
  await expect(page.getByText("Test Recipient")).toBeVisible();
  expect((await context.cookies()).filter(({ name }) => name.startsWith("mx_guest_session"))).toEqual([]);

  const qr = page.getByRole("img", { name: "Payment QR image" });
  await expect.poll(() => qr.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const copy = page.getByRole("button", { name: "Copy account number or merchant code" });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } },
      configurable: true,
    });
  });
  await copy.focus();
  await copy.press("Enter");
  await expect(page.getByRole("status")).toContainText("Could not copy");
  await expect(page.getByText("0012345", { exact: true })).toHaveCSS("user-select", "text");
  await expect(copy).toBeFocused();

  await page.evaluate(() => Reflect.deleteProperty(navigator, "clipboard"));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await copy.click();
  await expect(page.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("0012345");

  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === `${venuePath}/menu`);
  await page.getByRole("button", { name: "Choose Omelette", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add to order" }).click();
  const draft = page.getByRole("button", { name: /Your Draft/ });
  await expect(draft).toBeVisible();
  await page.getByRole("link", { name: "More", exact: true }).click();
  await page.getByRole("link", { name: /Payment details/ }).click();
  await expect(page.getByText("Public Test Bank")).toBeVisible();
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(draft).toBeVisible();

  // Keep newly picked items even if the browser rejects Draft writes.
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("maasii:draft:")) throw new DOMException("Denied", "SecurityError");
      save.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Choose Omelette", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add to order" }).click();
  await expect(draft).toContainText("2 dishes");
  await page.getByRole("link", { name: "More", exact: true }).click();
  await page.getByRole("link", { name: /Payment details/ }).click();
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(draft).toContainText("2 dishes");

  await updatePaymentOption(s.owner.actor, {
    venueId: s.venue.id, paymentOptionId: option.id, revision: option.revision, changes: { active: false },
  });
  await page.goto(`${venuePath}/payment`);
  await expect(page.getByText("No payment details are listed. Please ask your waiter.")).toBeVisible();
  await expect(page.getByText("Public Test Bank")).toHaveCount(0);

  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "የክፍያ መረጃ" })).toBeVisible();
  await page.getByRole("link", { name: "ምናሌ", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
});

test("an invalid payment Venue Link follows the guest not-found flow", async ({ page }) => {
  const response = await page.goto("/v/no-such-venue-for-payment/payment");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We can't find this menu" })).toBeVisible();
});
