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
  await dish.locator(":scope > summary").click();
  await dish.getByLabel("Base price (ETB)").fill("249.75");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const previewDish = page.getByRole("tabpanel", { name: "Preview", exact: true })
    .getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Omelette", exact: true }) });
  await expect(previewDish.getByTestId("price")).toContainText("249.75");

  const url = `/v/${s.venue.linkToken}/menu`;
  const guestDish = guest.getByRole("listitem").filter({ has: guest.getByRole("heading", { name: "Omelette", exact: true }) });
  await guest.goto(url);
  await expect(guestDish.getByTestId("price")).toContainText("220");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.")).toBeVisible();
  await guest.reload();
  await expect(guestDish.getByTestId("price")).toContainText("249.75");
  await guest.goto(`/v/${s.venues.Bole.linkToken}/menu`);
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

test("a Manager publishes a photographed local dish and archives and restores it", async ({ page, browser }) => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const guest = await browser.newPage({ ...test.info().project.use });
  await signIn(page, s.managers.Hana);
  await page.getByRole("link", { name: "Venue menu" }).click();
  await page.getByRole("link", { name: "Edit Venue Menu" }).click();
  const edit = page.getByRole("region", { name: "Edit" });
  await edit.getByRole("button", { name: "Add dish", exact: true }).first().click();
  await edit.getByLabel("Dish name in English", { exact: true }).filter({ visible: true }).fill("Lancha cake");
  const dish = edit.locator("details.editor-dish").filter({ hasText: "Lancha cake" });
  await dish.locator("summary").filter({ hasText: /^Description$/ }).click();
  await dish.getByLabel("Description in English").fill("Baked at this Venue.");
  await dish.getByLabel("Base price (ETB)").fill("80.50");
  await dish.getByLabel("Upload photo").setInputFiles("public/brands/bilos/almond-cake.webp");
  await expect(dish.locator("img")).toHaveAttribute("src", /\/venues\/[^/]+\/dish-.*\.webp$/);
  const publish = async () => {
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  };
  await publish();
  await guest.goto(`/v/${s.venue.linkToken}/menu`);
  await guest.getByRole("button", { name: "Choose Lancha cake", exact: true }).click();
  const detail = guest.getByRole("dialog");
  await expect(detail.getByText("Baked at this Venue.")).toBeVisible();
  await expect(detail.locator("img")).toHaveAttribute("src", /\/venues\/[^/]+\/dish-.*\.webp$/);
  await guest.goto(`/v/${s.venues.Bole.linkToken}/menu`);
  await expect(guest.getByRole("heading", { name: "Lancha cake" })).toHaveCount(0);

  if (!await dish.getByLabel("Base price (ETB)").isVisible()) await dish.locator(":scope > summary").click();
  await dish.locator("summary").filter({ hasText: /^Dish maintenance$/ }).click();
  await dish.getByRole("button", { name: "Archive dish" }).click();
  await publish();
  await guest.goto(`/v/${s.venue.linkToken}/menu`);
  await expect(guest.getByRole("heading", { name: "Lancha cake" })).toHaveCount(0);
  await edit.getByRole("button", { name: "Restore Lancha cake", exact: true }).click();
  await publish();
  await guest.reload();
  await expect(guest.getByRole("heading", { name: "Lancha cake" })).toBeVisible();
  await guest.close();
});
