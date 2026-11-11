import { expect, test, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { listPaymentOptions, updatePaymentOption } from "@/core";
import { scenario } from "../tests/support/scenario";
import type { TestUser } from "../tests/support/users";

async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manage$/);
}

test("an Owner reviews an account change, and a stale comparison cannot overwrite another edit", async ({ page, browser }) => {
  const s = await scenario().venue("Lancha").manager("Hana").build();
  await signIn(page, s.owner);
  await page.getByRole("link", { name: "Lancha" }).click();
  await page.getByRole("link", { name: "Payment Options" }).click();

  const add = page.getByRole("region", { name: "Add a Payment Option" });
  await add.getByLabel("Provider").fill("Test Bank");
  await add.getByLabel("Recipient name").fill("Bilo’s");
  await add.getByLabel("Account number or merchant code").fill("0012345");
  await add.getByLabel("QR image").setInputFiles({
    name: "payment.png",
    mimeType: "image/png",
    buffer: await QRCode.toBuffer("https://example.test/pay"),
  });
  await add.getByRole("button", { name: "Add Payment Option" }).click();

  const row = page.getByRole("article", { name: "Test Bank" });
  await expect(row.getByRole("img", { name: "Payment QR image" })).toBeVisible();
  await row.getByText("Edit Payment Option", { exact: true }).click();

  const account = row.getByLabel("Account number or merchant code");
  const comparison = row.getByRole("group", { name: "Confirm account change" });
  const confirm = comparison.getByRole("checkbox", { name: "I confirm this change" });
  const save = row.getByRole("button", { name: "Save Payment Option" });
  await account.fill("0098765");
  await expect(comparison.getByText("0012345", { exact: true })).toBeVisible();
  await expect(comparison.getByText("0098765", { exact: true })).toBeVisible();
  await save.click();
  await expect(confirm).not.toBeChecked();
  expect((await listPaymentOptions(s.owner.actor, { venueId: s.venue.id }))[0].accountOrMerchantCode).toBe("0012345");

  await confirm.check();
  await save.click();
  await expect(comparison).toBeHidden();
  await expect(row.getByText("0098765", { exact: true })).toBeVisible();

  await account.fill("0055555");
  await confirm.check();
  const [current] = await listPaymentOptions(s.owner.actor, { venueId: s.venue.id });
  await updatePaymentOption(s.owner.actor, {
    venueId: current.venueId,
    paymentOptionId: current.id,
    revision: current.revision,
    changes: { accountOrMerchantCode: "0044444" },
    accountChange: { before: "0098765", after: "0044444" },
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

  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Remove Payment Option" }).click();
  await expect(row).toHaveCount(0);
  await expect(history.getByText("Removed", { exact: true })).toBeVisible();
});
