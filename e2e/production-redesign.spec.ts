import { publishDraft } from "./support/menu-editor";
import { expect, test, type Page } from "@playwright/test";
import { acceptOrder, getMyTableOrders, startShift, getMenuDraft, saveMenuDraft, updateStaffLanguage } from "@/core";
import { scenario } from "../tests/support/scenario";
import type { TestUser } from "../tests/support/users";

async function signIn(page: Page, user: TestUser, brandId: string) {
  await updateStaffLanguage(user.actor, { language: "en" });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Email or phone").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/manage$/);
  await page.goto(`/manage/brands/${brandId}/menu`);
}

test("real photo and video uploads require Save and Publish, and video waits for detail and motion permission", async ({ page, browser }) => {
  const s = await scenario().publishedMenu().build();
  const guest = await browser.newPage({ ...test.info().project.use, reducedMotion: "reduce" });
  try {
    await signIn(page, s.owner, s.brand.id);
    const dish = page.getByRole("region", { name: "Edit" }).locator("details.editor-dish").filter({ hasText: "Omelette" });
    await dish.locator(":scope > summary").click();
    await dish.getByLabel("Upload photo").setInputFiles("public/brands/bilos/almond-cake.webp");
    await expect(dish.locator("img")).toHaveAttribute("src", /-detail.webp$/);
    await dish.locator("summary").filter({ hasText: /^Serving video/ }).click();
    await dish.getByLabel("Serving video").setInputFiles("tests/fixtures/serving-short.mp4");
    await expect(page.locator("#brand-menu-editor").getByRole("alert")).toContainText("H.264");
    await dish.getByLabel("Serving video").setInputFiles("tests/fixtures/serving.mp4");
    await expect(dish.locator("video")).toHaveAttribute("src", /dish-videos/);
    await expect(page.getByRole("button", { name: "Review and publish", exact: true })).toHaveCount(0);
    const url = `/v/${s.venue.linkToken}/menu`;
    const requests: string[] = [];
    const imagery: Promise<number>[] = [];
    guest.on("requestfinished", request => { if (request.resourceType() === "image") imagery.push(request.sizes().then(sizes => sizes.responseBodySize)); });
    guest.on("request", request => { if (request.url().includes("dish-videos")) requests.push(request.url()); });
    await guest.goto(url);
    await expect(guest.locator(".dish-row img")).toHaveCount(0);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.locator(".dish-row img")).toHaveCount(0);
    await publishDraft(page);
    await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.locator(".dish-row img")).toHaveAttribute("src", /-thumb.webp$/);
    expect(requests).toEqual([]);
    const initialImageBytes = (await Promise.all(imagery)).reduce((total, size) => total + size, 0);
    console.log(`Initial serving imagery: ${(initialImageBytes / 1024).toFixed(1)} KB`);
    expect(initialImageBytes).toBeLessThanOrEqual(350 * 1024);
    await guest.getByRole("button", { name: "Choose Omelette", exact: true }).click();
    const detail = guest.getByRole("dialog");
    await expect(detail.getByRole("button", { name: "Play serving video" })).toBeVisible();
    expect(requests).toEqual([]);
    await detail.getByRole("button", { name: "Play serving video" }).click();
    await expect(detail.locator("video")).toHaveAttribute("controls", "");
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await guest.goBack();
    await expect(guest.getByRole("dialog")).toHaveCount(0);
    await expect(guest).toHaveURL(url);
    await expect(guest.getByRole("button", { name: "Choose Omelette", exact: true })).toBeFocused();
    await guest.emulateMedia({ reducedMotion: "no-preference" });
    await guest.goto(`/v/${s.venue.linkToken}/more`);
    await guest.getByRole("checkbox", { name: "Play serving videos automatically" }).uncheck();
    await guest.getByRole("link", { name: "Menu", exact: true }).click();
    await guest.getByRole("button", { name: "Choose Omelette", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Play serving video" })).toBeVisible();
    await expect(detail.locator("video")).toHaveCount(0);
    await detail.getByRole("button", { name: "Play serving video" }).click();
    const paused = await detail.locator("video").evaluate(async (video: HTMLVideoElement) => {
      await video.play();
      await new Promise<void>(resolve => { video.addEventListener("pause", () => resolve(), { once: true }); video.pause(); });
      document.dispatchEvent(new Event("visibilitychange"));
      return video.paused;
    });
    expect(paused).toBe(true);
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await guest.evaluate(() => sessionStorage.setItem("maasii:automatic-video", "on"));
    await guest.addInitScript(() => Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } }));
    await guest.reload();
    await guest.getByRole("button", { name: "Choose Omelette", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Play serving video" })).toBeVisible();
    await expect(detail.locator("video")).toHaveCount(0);
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    // Broken media never removes choices or Add.
    await guest.route("**/storage/v1/object/public/**", route => route.abort());
    await guest.getByRole("button", { name: "Choose Omelette", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Add to order" })).toBeEnabled();
  } finally { await guest.close(); }
});

test("editor guards navigation, offers explicit tab recovery and retains edits on revision conflict", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  await signIn(page, s.owner, s.brand.id);
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveCount(0);
  const edit = page.getByRole("region", { name: "Edit" });
  await edit.getByText("Omelette", { exact: true }).click();
  await edit.getByLabel("Dish name in English").first().fill("Garden Omelette");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await page.getByRole("region", { name: "Guest preview" }).getByRole("link", { name: "Drinks", exact: true }).click();
  await expect(page).not.toHaveURL(/#section-/);
  await page.getByRole("tab", { name: "Edit", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("link", { name: "Maasii Owner" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(edit.getByLabel("Dish name in English").first()).toHaveValue("Garden Omelette");
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "Restore edits", exact: true }).click();
  await edit.getByText("Garden Omelette", { exact: true }).click();
  await expect(edit.getByLabel("Dish name in English").first()).toHaveValue("Garden Omelette");
  const server = await getMenuDraft(s.owner.actor, { brandId: s.brand.id });
  server.menu.sections[0].dishes[0].name.en = "Server Omelette";
  await saveMenuDraft(s.owner.actor, { brandId: s.brand.id, revision: server.revision, menu: server.menu });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("#brand-menu-editor").getByRole("alert")).toContainText("Menu changed");
  await expect(edit.getByLabel("Dish name in English").first()).toHaveValue("Garden Omelette");
  await expect(page.getByRole("button", { name: "Compare latest in another tab" })).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Reload latest", exact: true }).click();
  await expect(edit.getByLabel("Dish name in English").first()).toHaveValue("Garden Omelette");
});

test("dish Back restores search, section, focus and the current Draft", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  await page.goto(`/v/${s.venue.linkToken}/menu`);
  const search = page.getByRole("searchbox");
  await search.fill("Omelette");
  const choose = page.getByRole("button", { name: "Choose Omelette", exact: true });
  await choose.click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await choose.click();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(search).toHaveValue("Omelette");
  await expect(choose).toBeFocused();
  await expect(page.getByRole("button", { name: /Your Draft/ })).toContainText("1 dish");
});

test("redesigned guest and management surfaces fit all target widths and enlarged text", async ({ page }) => {
  test.setTimeout(90_000);
  const s = await scenario().brand("A long Brand name for readable layouts").publishedMenu({ sections: [{ name: { en: "Seasonal dishes", am: "ወቅታዊ ምግቦች" }, dishes: [{ name: { en: "Almond cake with seasonal fruit and fresh cream", am: "የአልሞንድ ኬክ ከፍራፍሬ ጋር" }, description: { en: "Baked here every morning, served with fresh fruit.", am: "በየጠዋቱ የሚጋገር ኬክ" }, priceSantim: 123456700, photoUrl: "/brands/bilos/almond-cake.webp" }] }] }).build();
  const root = `/v/${s.venue.linkToken}`;
  const widths = [320, 375, 390, 768, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${root}/menu`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const price = page.getByTestId("price");
    const box = (await price.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width - 20);
    await page.screenshot({ path: test.info().outputPath(`menu-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "Choose Almond cake with seasonal fruit and fresh cream", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add to order" })).toBeInViewport();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 760 });
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await page.addStyleTag({ content: "html {font-size:200%}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const enlarged = (await page.getByTestId("price").boundingBox())!;
  expect(enlarged.x + enlarged.width).toBeLessThanOrEqual(300);
  await page.screenshot({ path: test.info().outputPath("menu-amharic-enlarged.png"), fullPage: true });
  await signIn(page, s.owner, s.brand.id);
  for (const route of ["/manage", "/manage/operations", `/manage/brands/${s.brand.id}/branding`, `/manage/brands/${s.brand.id}/menu`, `/manage/venues/${s.venue.id}`, `/manage/venues/${s.venue.id}/floor`, `/manage/venues/${s.venue.id}/shifts`, `/manage/venues/${s.venue.id}/menu`, `/manage/venues/${s.venue.id}/menu/edit`, `/manage/venues/${s.venue.id}/closing`, `/manage/venues/${s.venue.id}/insights`, `/manage/venues/${s.venue.id}/payment-options`]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(320);
    await page.screenshot({ path: test.info().outputPath(`${route.replaceAll("/", "-")}.png`), fullPage: true });
  }
});


test("failed refresh retains the last Order status until a successful refresh", async ({ page }) => {
  const s = await scenario().waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [{ tableId: s.venue.tables[0].id, waiterId: sam.waiterId }] });
  const root = `/v/${s.venue.linkToken}`;
  await page.setViewportSize({ width: 390, height: 470 });
  await page.routeWebSocket("**/realtime/v1/websocket*", socket => socket.close());
  await page.goto(`${root}/menu`);
  await page.getByRole("button", { name: "Choose Omelette", exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("button", { name: /Your Draft/ }).click();
  await page.getByRole("button", { name: "Choose your table", exact: true }).click();
  const tableChoices = page.getByRole("group", { name: "Which table are you at?" });
  const lastTable = tableChoices.getByRole("button", { name: "Table 16", exact: true });
  await lastTable.scrollIntoViewIfNeeded();
  await expect(lastTable).toBeInViewport();
  await expect(page.getByRole("button", { name: "Which table are you at?" })).toBeInViewport();
  await page.getByRole("button", { name: "Table 1", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Sent", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Sent", { exact: true })).toBeVisible();
  let releaseOld!: () => void;
  let readyOld!: () => void;
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldReady = new Promise<void>(resolve => { readyOld = resolve; });
  let reads = 0;
  await page.route(`**${root}/orders`, async route => {
    if (++reads !== 1) return route.abort();
    const response = await route.fetch();
    const payload = await response.json();
    readyOld();
    await oldGate;
    await route.fulfill({ json: payload });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await oldReady;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(sheet.getByText(/This is your last known status/)).toBeVisible();
  const olderResponse = page.waitForResponse(response => response.url().endsWith(`${root}/orders`) && response.ok());
  releaseOld();
  await olderResponse;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  // An older successful response cannot erase a newer failure.
  await expect(sheet.getByText(/This is your last known status/)).toBeVisible();
  await expect(sheet.getByText("Sent", { exact: true })).toBeVisible();
  const { orders: [order] } = await getMyTableOrders(sam.actor, { unlockToken: sam.unlockToken });
  await acceptOrder(sam.actor, { orderId: order.id, unlockToken: sam.unlockToken });
  await expect(sheet.getByText("Accepted by Sam", { exact: true })).toHaveCount(0);
  await page.unroute(`**${root}/orders`);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(sheet.getByText("Accepted by Sam", { exact: true })).toBeVisible();
  await expect(sheet.getByText(/This is your last known status/)).toHaveCount(0);
});

test("editor explains denied recovery storage and saves in-memory edits before leaving", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("maasii:editor:")) throw new DOMException("Denied", "SecurityError");
      original.call(this, key, value);
    };
  });
  await signIn(page, s.owner, s.brand.id);
  const edit = page.getByRole("region", { name: "Edit" });
  await edit.getByText("Omelette", { exact: true }).click();
  await edit.getByLabel("Dish name in English").first().fill("Saved before leaving");
  await expect(page.getByText(/cannot store a recovery copy/)).toBeVisible();
  await page.getByRole("link", { name: "Maasii Owner" }).click();
  await page.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(page).toHaveURL(/\/manage$/);
  const saved = await getMenuDraft(s.owner.actor, { brandId: s.brand.id });
  expect(saved.menu.sections[0].dishes[0].name.en).toBe("Saved before leaving");
});

test("audit fixes keep editing focused and upload feedback beside its control", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, s.owner, s.brand.id);
  const edit = page.getByRole("region", { name: "Edit", exact: true });
  const search = page.getByRole("searchbox");
  await search.fill("Omelette");
  await edit.getByText("Omelette", { exact: true }).click();
  await expect(edit.getByText("Chechebsa", { exact: true })).toBeHidden();
  await expect(edit.getByRole("button", { name: "Add Option Group" })).toBeHidden();
  const am = await edit.getByLabel("Dish name in Amharic").first().boundingBox();
  const en = await edit.getByLabel("Dish name in English").first().boundingBox();
  expect(en!.y).toBeGreaterThan(am!.y + am!.height);
  await edit.getByLabel("Base price (ETB)").first().fill("245.75");
  await edit.locator("summary").filter({ hasText: /^Serving video/ }).first().click();
  const input = edit.getByLabel("Serving video · optional", { exact: true }).first();
  await input.setInputFiles({ name: "invalid.mp4", mimeType: "video/mp4", buffer: Buffer.from("invalid mp4") });
  const error = edit.getByRole("alert");
  await expect(error).toContainText("H.264");
  await expect(error).toBeInViewport();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(error.getByRole("button", { name: "Retry upload" })).toBeVisible();
  await error.getByRole("button", { name: "Retry upload" }).click();
  await expect(error).toContainText("invalid.mp4");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("editor-inline-error-390.png") });
  await page.getByRole("button", { name: "← All dishes" }).click();
  await expect(search).toHaveValue("Omelette");
  await expect(edit.locator("summary").filter({ hasText: /^Omelette/ }).first()).toBeFocused();
  await edit.getByText("Omelette", { exact: true }).click();
  await expect(edit.getByLabel("Base price (ETB)").first()).toHaveValue("245.75");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
});

test("audit fixes preserve Home intent, category orientation and truthful navigation", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  const root = `/v/${s.venue.linkToken}`;
  await page.goto(root);
  await page.getByRole("link", { name: "Search dishes or ingredients" }).click();
  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("ክላሲክ");
  await expect(page.getByRole("heading", { name: "Omelette", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chechebsa", exact: true })).toBeHidden();
  await page.goBack();
  await page.getByRole("link").filter({ has: page.getByRole("heading", { name: "Omelette", exact: true }) }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Omelette");
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const choose = page.getByRole("button", { name: "Choose Omelette", exact: true });
  await expect(choose).toBeVisible();
  expect((await choose.boundingBox())!.height).toBeLessThanOrEqual(152);
  await page.getByRole("link", { name: "Drinks", exact: true }).click();
  await page.getByRole("link", { name: "Breakfast", exact: true }).click();
  await expect(choose).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Drinks", exact: true })).toBeHidden();
  await page.getByRole("link", { name: "Your table", exact: true }).click();
  await expect(page.getByRole("link", { name: "Your table", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Menu", exact: true })).not.toHaveAttribute("aria-current");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("link", { name: "Menu", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Your table", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("operations and Owner guidance reflect configured running service", async ({ page, browser }) => {
  const s = await scenario().venue("Ready Venue", { tables: 2 }).waiter("Sam").publishedMenu().build();
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [{ tableId: s.venue.tables[0].id, waiterId: s.waiters.Sam.waiterId }] });
  await signIn(page, s.owner, s.brand.id);
  await page.goto("/manage");
  await expect(page.getByText("Collecting feedback for Ready Venue.")).toBeVisible();
  await page.goto("/manage/operations");
  await expect(page.getByText("1 of 2 Tables assigned · 1 Waiter")).toBeVisible();
  await expect(page.getByRole("link", { name: "Assign uncovered Tables" })).toHaveAttribute("href", `/manage/venues/${s.venue.id}/shifts#assignments`);
  await page.screenshot({ path: test.info().outputPath("operations-390.png"), fullPage: true });
  const guest = await browser.newPage({ ...test.info().project.use });
  try {
    await guest.goto(`/v/${s.venue.linkToken}/menu`);
    await guest.getByRole("button", { name: "Choose Omelette", exact: true }).click();
    await guest.getByRole("button", { name: "Add to order" }).click();
    await guest.getByRole("button", { name: /Your Draft/ }).click();
    await guest.getByRole("button", { name: "Choose your table", exact: true }).click();
    await guest.getByRole("button", { name: "Table 1", exact: true }).click();
    await guest.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    await expect(guest.getByRole("dialog").getByText("Sent", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("link", { name: "Open Table 1", exact: true }).click();
    await expect(page).toHaveURL(/\/operations#floor-visit-/);
    await expect(page.getByRole("region", { name: "Open Tables" }).getByText("1 × Omelette")).toBeVisible();
  } finally {
    await guest.close();
  }
});
