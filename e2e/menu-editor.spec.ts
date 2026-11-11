import { expect, test, type Page } from "@playwright/test";
import { updateBranding, updateStaffLanguage } from "@/core";
import { LANGUAGE_COOKIE } from "@/i18n/config";
import { sampleMenu, scenario } from "../tests/support/scenario";
import type { TestUser } from "../tests/support/users";

async function signIn(page: Page, user: TestUser) {
  await updateStaffLanguage(user.actor, { language: "en" });
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manage$/);
}

test("an Owner edits a Menu on mobile and previews it without guest writes", async ({ page }) => {
  const s = await scenario().brand("Buna House").publishedMenu().build();
  const venue = `/v/${s.venue.linkToken}`;
  await page.goto(venue);
  await page.getByRole("button", { name: "Omelette" }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  const guestStorage = await page.evaluate(() => ({ ...localStorage }));
  const guestLanguage = (await page.context().cookies()).find((cookie) => cookie.name === LANGUAGE_COOKIE.guest);
  await signIn(page, s.owner);

  const guestWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/v/")) {
      guestWrites.push(request.url());
    }
  });
  await page.getByRole("link", { name: "Brand menu" }).click();
  await expect(page.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Last published/)).toBeVisible();
  await page.getByRole("region", { name: "Edit" }).getByText("Omelette", { exact: true }).click();
  await page.getByLabel("Dish name in English").first().fill("Garden Omelette");
  await page.getByLabel("Dish name in Amharic").first().fill("");
  await page.getByLabel("Base price (ETB)").first().fill("245.75");
  await page.getByLabel("Fasting", { exact: true }).first().check();
  await expect(page.getByText("Missing translation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await page.reload();

  await page.getByRole("tab", { name: "Preview" }).click();
  const preview = page.getByRole("region", { name: "Guest preview" });
  await expect(preview.getByText("Draft", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Garden Omelette" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Garden Omelette");
  await expect(page.getByRole("dialog").getByText("245.75")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to order" })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await preview.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "Garden Omelette" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "አማ", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Your Draft/ })).toHaveCount(0);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(guestStorage);
  expect((await page.context().cookies()).find((cookie) => cookie.name === LANGUAGE_COOKIE.guest)).toEqual(guestLanguage);
  expect(guestWrites).toEqual([]);

  await expect(page.getByText("1 dish is missing a translation.")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  await expect(page.getByText("No unpublished changes")).toBeVisible();
  await page.goto(venue);
  await expect(page.getByRole("heading", { name: "Garden Omelette" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Omelette", exact: true })).toHaveCount(0);
});

test("desktop Owners arrange sections and dishes beside the live guest Menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const menu = structuredClone(sampleMenu);
  menu.sections[0].dishes[0].photoUrl = "/brands/bilos/almond-cake.webp";
  const s = await scenario().publishedMenu(menu).build();
  await updateBranding(s.owner.actor, { brandId: s.brand.id, colour: "#568F69", displayFont: "noto-serif-ethiopic" });
  await signIn(page, s.owner);
  await page.getByRole("link", { name: "Brand menu" }).click();

  const edit = page.getByRole("region", { name: "Edit" });
  const preview = page.getByRole("region", { name: "Guest preview" });
  const form = (await edit.boundingBox())!;
  expect((await preview.boundingBox())!.x).toBeGreaterThan(form.x + form.width);
  await expect(preview.locator("header")).toHaveCSS("border-top-color", "rgb(86, 143, 105)");
  await edit.getByText("Omelette", { exact: true }).click();
  const am = (await edit.getByLabel("Dish name in Amharic").first().boundingBox())!;
  const en = (await edit.getByLabel("Dish name in English").first().boundingBox())!;
  expect(en.x).toBeGreaterThan(am.x + am.width);
  expect(en.y).toBe(am.y);
  await edit.getByLabel("House favourite", { exact: true }).first().check();
  const favourite = preview.getByRole("article", { name: "House favourite" });
  await expect(favourite.getByRole("heading", { name: "Omelette" })).toBeVisible();
  await expect(favourite.locator("img")).toHaveAttribute("src", "/brands/bilos/almond-cake.webp");
  await edit.getByRole("button", { name: "Add section" }).click();
  const section = edit.getByRole("group", { name: "Section 3", exact: true });
  await section.getByLabel("Section name in English").fill("Pastries");
  await section.getByLabel("Section name in Amharic").fill("ፓስትሪዎች");
  await section.getByRole("button", { name: "Add dish" }).click();
  await section.getByLabel("Dish name in English").fill("Jam Tart");
  await section.getByLabel("Description in English").fill("Sweet and tangy");
  await section.getByLabel("Base price (ETB)").fill("150");
  const tart = preview.getByRole("heading", { name: "Jam Tart" });
  await expect(tart).toBeVisible();
  await expect(preview.getByText("Sweet and tangy")).toBeVisible();
  await expect(preview.getByText("150", { exact: true })).toBeVisible();

  await section.getByRole("button", { name: "Move up" }).first().click();
  await expect(preview.getByRole("navigation", { name: "Menu sections" }).getByRole("link")).toHaveText(["Breakfast", "Pastries", "Drinks"]);
  const breakfast = edit.getByRole("group", { name: "Section 1", exact: true });
  await breakfast.getByText("Chechebsa", { exact: true }).click();
  const dish = breakfast.locator("details").filter({ hasText: "Chechebsa" });
  await dish.getByRole("button", { name: "Move up" }).click();
  await expect(preview.getByRole("region", { name: "Breakfast" }).getByRole("heading", { level: 3 })).toHaveText(["Chechebsa", "Omelette"]);
  await breakfast.getByLabel("Section name in English").fill("Morning");
  await expect(preview.getByRole("region", { name: "Morning" })).toBeVisible();

  await edit.getByRole("group", { name: "Section 3", exact: true }).getByRole("button", { name: "Remove section" }).click();
  await expect(preview.getByRole("heading", { name: "Drinks" })).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  await page.goto(`/v/${s.venue.linkToken}`);
  await expect(page.getByRole("heading", { name: "Jam Tart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Drinks" })).toHaveCount(0);
});
