import { expect, test } from "@playwright/test";
import { secureCookies } from "@/lib/secure-cookies";
import { updateBranding } from "@/core";
import { scenario } from "../tests/support/scenario";

for (const fallback of [false, true]) {
  test(`native sheets restore keyboard focus and dismiss safely${fallback ? " without closedby support" : ""}`, async ({ page }) => {
    const s = await scenario().publishedMenu().build();
    if (fallback) await page.addInitScript(() => { delete (HTMLDialogElement.prototype as { closedBy?: string }).closedBy; });
    await page.goto(`/v/${s.venue.linkToken}`);
    const open = page.getByRole("button", { name: "Omelette", exact: true });
    const sheet = page.getByRole("dialog");
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(open).toBeFocused();
    await page.keyboard.press("Enter");
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(open).toBeFocused();
    await page.keyboard.press("Enter");
    // A text-selection drag ending on the backdrop must not dismiss.
    const box = (await sheet.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(10, 2);
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    await page.mouse.click(10, 2);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(open).toBeFocused();
    await page.keyboard.press("Enter");
    await sheet.getByRole("button", { name: "Add to order" }).click();
    await expect(open).toBeFocused();
    const slip = page.getByRole("button", { name: /Your Draft/ });
    await slip.focus();
    await page.keyboard.press("Enter");
    await expect(sheet.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "Edit", exact: true }).click();
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(sheet.getByRole("heading", { name: "Your table" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(slip).toBeFocused();
  });
}

test("a failed ordering download offers recovery without losing the Draft", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  await page.goto(`/v/${s.venue.linkToken}`);
  await page.getByRole("button", { name: "Omelette", exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.route("**/_next/static/chunks/*.js", (route) => route.abort("failed"));
  await page.getByRole("button", { name: /Your Draft/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Your Draft is still on this phone");
  await page.unroute("**/_next/static/chunks/*.js");
  await page.getByRole("button", { name: "Reload to retry" }).click();
  await page.getByRole("button", { name: /Your Draft/ }).click();
  await expect(page.getByRole("dialog").getByText("Omelette", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Send", exact: true })).toBeVisible();
});

test("the menu reflows at 320px and enlarged text, prioritizes its cover and enforces script security", async ({ page, request }) => {
  const s = await scenario().publishedMenu().build();
  await updateBranding(s.owner.actor, { brandId: s.brand.id, colour: "#568F69", displayFont: "noto-serif-ethiopic" });
  const url = `/v/${s.venue.linkToken}`;
  const violations: string[] = [];
  page.on("console", (message) => { if (/violates.*Content Security Policy|Refused to.*script/i.test(message.text())) violations.push(message.text()); });
  const response = (await page.goto(url))!;
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-inline'");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const other = await request.get(url);
  expect(other.headers()["content-security-policy"]).not.toBe(policy);
  await page.setViewportSize({ width: 320, height: 851 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(violations).toEqual([]);
  // Deliberately injected executable text must be blocked while app hydration above works.
  await page.route(`**${url}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("</body>",
      "<script>document.documentElement.dataset.injected = 'yes'</script></body>") });
  });
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-injected", "yes");
});

test("the cover is eager and background scroll is contained on Chromium", async ({ page, browserName }) => {
  await page.goto("/v/bilos-lancha");
  const cover = page.locator('img[fetchpriority="high"]');
  await expect(cover).toHaveCount(1);
  await expect(cover).not.toHaveAttribute("loading", "lazy");
  await page.getByRole("button", { name: "Omelette", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toHaveCSS("overscroll-behavior", "contain");
  if (browserName === "chromium") {
    const y = await page.evaluate(() => scrollY);
    await page.mouse.move(10, 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => scrollY)).toBe(y);
  }
});


test("session cookies require HTTPS on public deployments, including without forwarded headers", () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, MAASII_SITE_URL: process.env.MAASII_SITE_URL };
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.MAASII_SITE_URL;
    expect(secureCookies(new Headers({ host: "maasii.example" }))).toBe(true);
    expect(secureCookies(new Headers({ host: "127.0.0.1:4317" }))).toBe(false);
    expect(secureCookies(new Headers({ host: "localhost:4317", "x-forwarded-proto": "https" }))).toBe(true);
    process.env.MAASII_SITE_URL = "https://maasii.example";
    expect(secureCookies(new Headers({ host: "localhost:3000" }))).toBe(true);
    process.env.MAASII_SITE_URL = "http://maasii.example";
    expect(secureCookies(new Headers())).toBe(true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("ordering recovery never reloads an unsaved Draft when storage is denied", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Denied", "SecurityError"); };
  });
  await page.goto(`/v/${s.venue.linkToken}`);
  await page.getByRole("button", { name: "Omelette", exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.route("**/_next/static/chunks/*.js", (route) => route.abort("failed"));
  await page.getByRole("button", { name: /Your Draft/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("alert")).toContainText("Keep this page open");
  await expect(sheet.getByRole("button", { name: "Reload to retry" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(sheet.getByText("Omelette", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("alert")).toContainText("Keep this page open");
});
