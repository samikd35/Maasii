import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { getMenuDraft, importMenuPhotos, suggestMenuTranslations, updateBranding, updateStaffLanguage } from "@/core";
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

test("an Owner edits Dish photos and Option Groups, then archives and restores the Dish", async ({ page, context }) => {
  const s = await scenario().publishedMenu().build();
  const guest = await context.newPage();
  const venue = `/v/${s.venue.linkToken}`;
  await signIn(page, s.owner);
  await page.getByRole("link", { name: "Brand menu" }).click();

  const edit = page.getByRole("region", { name: "Edit" });
  const dish = edit.locator("details").filter({ hasText: "Omelette" });
  await dish.locator("summary").click();
  await dish.getByLabel("Upload photo").setInputFiles("public/brands/bilos/almond-cake.webp");
  const photo = dish.locator("img");
  await expect(photo).toHaveAttribute("src", /\/storage\/v1\/object\/public\/brand-artwork\/.*\.webp$/);
  const original = await photo.getAttribute("src");
  await dish.getByLabel("Replace photo").setInputFiles("public/brands/bilos/logo.webp");
  await expect(photo).not.toHaveAttribute("src", original!);
  const replacement = await photo.getAttribute("src");

  await dish.getByRole("button", { name: "Add Option Group" }).click();
  const group = dish.getByRole("group", { name: "New Option Group" });
  await group.getByLabel("Option Group name in English").fill("Bread");
  const bread = dish.getByRole("group", { name: "Bread" });
  await bread.getByLabel("Option Group name in Amharic").fill("ዳቦ");
  await bread.getByLabel("Required", { exact: true }).check();
  await bread.getByRole("button", { name: "Add choice" }).click();
  await bread.getByLabel("Choice name in English").fill("Rye");
  await bread.getByLabel("Choice name in Amharic").fill("ራይ");
  await bread.getByLabel("Price change (ETB)").fill("12.50");

  await dish.getByRole("button", { name: "Add Option Group" }).click();
  await group.getByLabel("Option Group name in English").fill("Extras");
  const extras = dish.getByRole("group", { name: "Extras" });
  await extras.getByLabel("Option Group name in Amharic").fill("ተጨማሪዎች");
  await extras.getByLabel("Kind").selectOption("add_extras");
  await expect(extras.getByLabel("Required", { exact: true })).toHaveCount(0);
  await extras.getByRole("button", { name: "Add choice" }).click();
  await extras.getByLabel("Choice name in English").fill("Cheese");
  await extras.getByLabel("Choice name in Amharic").fill("አይብ");
  await extras.getByRole("button", { name: "Move up" }).first().click();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Preview" }).click();
  const preview = page.getByRole("region", { name: "Guest preview" });
  await preview.getByRole("button", { name: "Omelette", exact: true }).click();
  const previewDish = preview.getByRole("dialog");
  await expect(previewDish.locator("img")).toHaveAttribute("src", replacement!);
  await expect(previewDish.locator("legend")).toHaveText(["Extras", "Bread"]);
  await expect(previewDish.getByRole("button", { name: "Add to order" })).toBeDisabled();
  await previewDish.getByRole("button", { name: "Close" }).click();

  await guest.goto(venue);
  await guest.getByRole("button", { name: "Omelette", exact: true }).click();
  const guestDish = guest.getByRole("dialog");
  await expect(guestDish.locator("img")).toHaveCount(0);
  await expect(guestDish.getByText("Rye")).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  await guest.reload();
  await guest.getByRole("button", { name: "Omelette", exact: true }).click();
  await expect(guestDish.locator("img")).toHaveAttribute("src", replacement!);
  await expect(guestDish.getByRole("radio", { name: "Rye +12.5 ETB" })).toBeVisible();

  await page.getByRole("tab", { name: "Edit" }).click();
  await dish.locator("summary").click();
  await dish.getByRole("button", { name: "Remove photo" }).click();
  await extras.getByRole("button", { name: "Remove Option Group" }).click();
  await dish.getByRole("button", { name: "Archive dish" }).click();
  await expect(edit.getByRole("heading", { name: "Archived dishes" })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole("button", { name: "Omelette", exact: true })).toHaveCount(0);

  await page.reload();
  await edit.getByRole("button", { name: "Restore Omelette" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  await guest.reload();
  await guest.getByRole("button", { name: "Omelette", exact: true }).click();
  await expect(guestDish.locator("img")).toHaveCount(0);
  await expect(guestDish.locator("legend")).toHaveText(["Bread"]);
});

test("the Owner reviews imported dishes and suggested text before publishing", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  const actor = s.owner.actor;
  const input = { brandId: s.brand.id };
  const before = await getMenuDraft(actor, input);
  const photo = new File([await readFile("public/brands/bilos/almond-cake.webp")], "paper.webp", { type: "image/webp" });
  await importMenuPhotos(actor, { ...input, revision: before.revision, photos: [photo] }, {
    model: async () => ({ sections: [{
      name: { am: "ዳቦዎች", en: "Breads" },
      dishes: [
        { name: { am: "", en: "Honey bread" }, description: { am: "", en: "Sweet bread" }, priceSantim: 12500 },
        { name: { am: "", en: "Toast" }, description: { am: "", en: "" }, priceSantim: null },
      ],
    }] }),
  });
  const draft = await getMenuDraft(actor, input);
  const imported = draft.menu.sections.at(-1)!;
  await suggestMenuTranslations(actor, {
    ...input, revision: draft.revision, sectionId: imported.sectionId, dishId: imported.dishes[0].dishId,
  }, { model: async () => ({ name: "የማር ዳቦ", description: "ጣፋጭ ዳቦ" }) });

  await signIn(page, s.owner);
  await page.getByRole("link", { name: "Brand menu" }).click();
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeDisabled();
  await expect(page.getByText("Review imported entries and suggested translations before publishing.")).toBeVisible();

  const edit = page.getByRole("region", { name: "Edit" });
  await edit.getByLabel("Paper Menu photos").setInputFiles({ name: "invalid.webp", mimeType: "image/webp", buffer: Buffer.from("invalid") });
  await edit.getByRole("button", { name: "Import photos" }).click();
  await expect(page.locator("#brand-menu-editor").getByRole("alert")).toHaveText("Choose a JPEG, PNG or WebP image up to 4 MB.");

  await edit.getByRole("button", { name: "Keep section" }).click();
  const bread = edit.locator("details").filter({ hasText: "Honey bread" });
  await bread.locator("summary").click();
  await expect(bread.getByText("Suggested", { exact: true })).toHaveCount(2);
  await bread.getByRole("button", { name: "Accept suggestion for Dish name in Amharic" }).click();
  await bread.getByRole("textbox", { name: "Description in Amharic", exact: true }).fill("ጣፋጭ የማር ዳቦ");
  await expect(bread.getByText("Suggested", { exact: true })).toHaveCount(0);
  await bread.getByRole("button", { name: "Keep dish" }).click();
  const toast = edit.locator("details").filter({ hasText: "Toast" });
  await toast.locator("summary").click();
  const keepToast = toast.getByRole("button", { name: "Keep dish" });
  await expect(keepToast).toBeDisabled();
  await toast.getByLabel("Base price (ETB)").fill("80");
  await expect(keepToast).toBeEnabled();
  await toast.getByRole("button", { name: "Discard dish" }).click();
  await expect(toast).toHaveCount(0);

  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText("Menu published.")).toBeVisible();
  await page.goto(`/v/${s.venue.linkToken}`);
  await expect(page.getByRole("heading", { name: "Honey bread" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toast" })).toHaveCount(0);
});
