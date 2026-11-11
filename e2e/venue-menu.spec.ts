import { expect, test, type Page } from "@playwright/test";
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

test("Venue staff change the price and Sold Out status guests see without publishing", async ({ page, browser }) => {
  const s = await scenario().venue("Lancha").manager("Hana").publishedMenu().build();
  const guest = await browser.newPage({ ...test.info().project.use });
  const manager = await browser.newPage({ ...test.info().project.use });

  await signIn(page, s.owner);
  await page.getByRole("link", { name: "Lancha" }).click();
  await page.getByRole("link", { name: "Venue menu" }).click();
  const ownerDish = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Omelette", exact: true }) });
  await expect(ownerDish.getByText("ኦምሌት", { exact: true })).toBeVisible();
  const ownerPrice = ownerDish.getByLabel("Venue price (ETB)");
  await ownerPrice.fill("249.75");
  await ownerDish.getByRole("button", { name: "Save price" }).click();
  await expect(ownerDish.getByRole("status")).toHaveText("Venue price saved.");

  await guest.goto(`/v/${s.venue.linkToken}`);
  const guestDish = guest.getByRole("listitem").filter({ has: guest.getByRole("heading", { name: "Omelette", exact: true }) });
  await expect(guestDish.getByTestId("price")).toContainText("249.75");

  await signIn(manager, s.managers.Hana);
  await manager.goto(page.url());
  await expect(manager.getByLabel("Venue price (ETB)")).toHaveCount(0);
  const soldOut = manager.getByRole("switch", { name: "Omelette Sold Out" });
  await expect(soldOut).not.toBeChecked();
  await soldOut.click();
  await expect(soldOut).toBeChecked();
  await guest.reload();
  await expect(guestDish).toHaveCount(0);

  await manager.getByRole("button", { name: "አማ", exact: true }).click();
  const translatedSwitch = manager.getByRole("switch", { name: "ኦምሌት አልቋል" });
  await expect(translatedSwitch).toBeChecked();
  await expect(manager.getByText("Omelette", { exact: true })).toBeVisible();
  await translatedSwitch.click();
  await expect(translatedSwitch).not.toBeChecked();
  await guest.reload();
  await expect(guestDish.getByTestId("price")).toContainText("249.75");

  await ownerPrice.fill("");
  await ownerDish.getByRole("button", { name: "Save price" }).click();
  await expect(ownerDish.getByRole("status")).toHaveText("Brand price restored.");
  await guest.reload();
  await expect(guestDish.getByTestId("price")).toContainText("220");
});
