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
  await expect(page).toHaveURL(/\/manage(?:\/operations)?$/);
}

test("a Manager previews and publishes local dish changes without changing another Venue", async ({ page, browser }) => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const guest = await browser.newPage({ ...test.info().project.use });
  await signIn(page, s.managers.Hana);
  await page.getByRole("link", { name: "Venue menu" }).click();
  await page.getByRole("link", { name: "Edit Venue Menu" }).click();

  const dish = page.locator("details").filter({ has: page.getByText("Omelette", { exact: true }) }).first();
  await dish.locator("summary").click();
  await dish.getByLabel("Base price (ETB)").fill("249.75");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const previewDish = page.getByRole("tabpanel", { name: "Preview", exact: true })
    .getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Omelette", exact: true }) });
  await expect(previewDish.getByTestId("price")).toContainText("249.75");

  const url = `/v/${s.venue.linkToken}`;
  const guestDish = guest.getByRole("listitem").filter({ has: guest.getByRole("heading", { name: "Omelette", exact: true }) });
  await guest.goto(url);
  await expect(guestDish.getByTestId("price")).toContainText("220");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.")).toBeVisible();
  await guest.reload();
  await expect(guestDish.getByTestId("price")).toContainText("249.75");
  await guest.goto(`/v/${s.venues.Bole.linkToken}`);
  await expect(guestDish.getByTestId("price")).toContainText("220");
  expect((await page.goto(`/manage/venues/${s.venues.Bole.id}/menu/edit`))?.status()).toBe(404);

  await page.goto(`/manage/venues/${s.venue.id}/menu`);
  const soldOut = page.getByRole("switch", { name: "Omelette Sold Out" });
  await soldOut.click();
  await expect(soldOut).toBeChecked();
  await guest.goto(url);
  await expect(guestDish).toHaveCount(0);
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  const translatedSwitch = page.getByRole("switch", { name: "ኦምሌት አልቋል" });
  await expect(translatedSwitch).toBeChecked();
  await translatedSwitch.click();
  await expect(translatedSwitch).not.toBeChecked();
  await guest.reload();
  await expect(guestDish.getByTestId("price")).toContainText("249.75");
  await guest.close();
});
