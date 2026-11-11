import { expect, test } from "@playwright/test";
import { scenario } from "../tests/support/scenario";

test("an Owner can set Service Periods and select a reporting week", async ({ page }) => {
  const s = await scenario().venue("Lancha").publishedMenu().build();
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(s.owner.email);
  await page.getByLabel("Password").fill(s.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Lancha" }).click();
  await page.getByRole("link", { name: "Dish insights" }).click();
  await page.getByText("Service hours and periods", { exact: true }).click();
  await page.locator('input[name="opensAt"]').fill("07:00");
  await page.locator('input[name="closesAt"]').fill("22:00");
  await page.getByLabel("Period name").fill("Breakfast");
  await page.locator('input[name="startsAt"]').fill("07:00");
  await page.locator('input[name="endsAt"]').fill("11:00");
  await page.getByRole("button", { name: "Save service hours and periods" }).click();
  await expect(page.getByRole("group", { name: "Breakfast", exact: true })).toBeVisible();
  await page.locator('input[name="week"]').fill("2026-11-08");
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(page.getByText(/2026-11-02.*2026-10-26/)).toBeVisible();
});
