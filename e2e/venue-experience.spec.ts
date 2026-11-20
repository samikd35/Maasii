import { uniquePhone } from "../tests/support/users";
import { publishDraft } from "./support/menu-editor";
import { expect, test } from "@playwright/test";
import {
  addPaymentOption, createWaiterJoinCode, getShiftSetup, startShift, updateBrandSocialLinks,
} from "@/core";
import { scenario } from "../tests/support/scenario";

test("a local Venue Menu flows through the homepage, Guest and Waiter Orders, payment and private Reviews", async ({ page, browser, baseURL }) => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const venueId = s.venue.id;
  const home = `/v/${s.venue.linkToken}`;
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId, siteUrl: baseURL! });
  await addPaymentOption(s.owner.actor, {
    venueId, kind: "bank_transfer", provider: "Test Bank", recipientName: "Lancha Café",
    accountOrMerchantCode: "001234", displayOrder: 1,
  });
  await updateBrandSocialLinks(s.owner.actor, {
    brandId: s.brand.id, links: [{ name: "Official Instagram", url: "https://www.instagram.com/lanchacafe/" }],
  });

  const staff = await browser.newContext({ ...test.info().project.use, baseURL });
  try {
    const manager = await staff.newPage();
    await manager.goto("/sign-in");
    await manager.getByRole("button", { name: "EN", exact: true }).click();
    const hana = s.managers.Hana;
    await manager.getByLabel("Email or phone").fill(hana.email);
    await manager.getByLabel("Password").fill(hana.password);
    await manager.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(manager.getByRole("heading", { name: "Venue operations" })).toBeVisible();
    await manager.getByRole("link", { name: "Venue menu", exact: true }).click();
    await manager.getByRole("link", { name: "Edit Venue Menu" }).click();
    const editor = manager.getByRole("region", { name: "Edit", exact: true });
    const dish = editor.locator("details").filter({ hasText: "Omelette" }).first();
    await dish.locator(":scope > summary").click();
    await dish.getByLabel("Base price (ETB)").fill("240");
    await editor.getByRole("button", { name: "← All dishes" }).click();
    await editor.getByRole("button", { name: "Add dish", exact: true }).first().click();
    await editor.getByLabel("Dish name in English", { exact: true }).filter({ visible: true }).fill("Lancha tea");
    await editor.locator("details").filter({ hasText: "Lancha tea" }).getByLabel("Base price (ETB)").fill("90");
    await manager.getByRole("button", { name: "Save draft" }).click();
    await expect(manager.getByText("Draft saved.", { exact: true })).toBeVisible();
    await publishDraft(manager);
    await expect(manager.getByText("Menu published.", { exact: true })).toBeVisible();
    await page.goto(`/v/${s.venues.Bole.linkToken}/menu`);
    await expect(page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: "Omelette", exact: true }),
    }).getByTestId("price")).toContainText("220");
    await expect(page.getByRole("heading", { name: "Lancha tea" })).toHaveCount(0);

    const device = await browser.newContext({ ...test.info().project.use, baseURL });
    try {
      const waiter = await device.newPage();
      await waiter.goto(url);
      await waiter.getByRole("button", { name: "EN", exact: true }).click();
      await waiter.getByLabel("Name").fill("Sam");
      await waiter.getByLabel("Phone number").fill(uniquePhone());
      await waiter.getByLabel("Choose a 6-digit PIN").fill("042731");
      await waiter.getByRole("button", { name: "Join venue" }).click();
      await expect(waiter.getByRole("heading", { name: "Order queue" })).toBeVisible();
      const { waiters } = await getShiftSetup(s.owner.actor, { venueId });
      await startShift(s.owner.actor, { venueId, assignments: [{ tableId: s.venue.tables[0].id, waiterId: waiters[0].id }] });

      await page.goto(home);
      await page.getByRole("link", { name: "More", exact: true }).click();
      await page.getByRole("main").getByRole("link", { name: /Payment details/ }).click();
      await expect(page.getByText("001234", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "More", exact: true }).click();
      await page.getByRole("main").getByRole("link", { name: /Social media/ }).click();
      await expect(page.getByRole("heading", { name: "Social media", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Official Instagram" })).toHaveAttribute("href", "https://www.instagram.com/lanchacafe/");
      await page.getByRole("link", { name: "More", exact: true }).click();
      await page.getByRole("main").getByRole("link", { name: /Private feedback/ }).click();
      await expect(page.getByRole("radio", { name: "Great" })).toHaveCount(0);
      await page.getByRole("link", { name: "Menu", exact: true }).click();
      await page.getByRole("button", { name: "Choose Omelette", exact: true }).click();
      await page.getByRole("button", { name: "Add to order" }).click();
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page.getByRole("link", { name: "Continue your order" }).click();
      const slip = page.getByRole("dialog");
      await slip.getByRole("button", { name: "Choose your table", exact: true }).click();
      await page.getByRole("button", { name: "Table 1", exact: true }).click();
      await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
      await waiter.getByRole("button", { name: /^Accept / }).click();
      await expect(slip.getByText("Accepted by Sam", { exact: true })).toBeVisible();
      await waiter.getByRole("link", { name: "Tables", exact: true }).click();
      await waiter.getByRole("link", { name: "Table 1 In service" }).click();
      await waiter.getByRole("link", { name: "Add a Dish" }).click();
      await waiter.getByRole("button", { name: /Lancha tea/ }).click();
      await waiter.getByRole("button", { name: "Add to Table 1" }).click();
      await waiter.getByRole("button", { name: "Prepare bill", exact: true }).click();
      await expect(slip.getByRole("region", { name: "Bill total" })).toContainText("330 ETB");
      await slip.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page.getByRole("link", { name: "View your bill", exact: true }).click();
      await expect(slip.getByRole("region", { name: "Bill total" })).toContainText("330 ETB");

      await waiter.getByRole("button", { name: "Enter receipt", exact: true }).click();
      await waiter.getByLabel("Method").selectOption({ label: "Test Bank · 001234" });
      await waiter.getByLabel("Official Receipt amount (ETB)").fill("330");
      await waiter.getByRole("button", { name: "Record payment", exact: true }).click();
      await expect(slip.getByText("Bill paid", { exact: true })).toBeVisible();
      await slip.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("link", { name: "More", exact: true }).click();
      await page.getByRole("main").getByRole("link", { name: /Private feedback/ }).click();
      await page.getByText("Tell us about a dish · optional", { exact: true }).click();
      await page.getByRole("checkbox", { name: "Lancha tea", exact: true }).check();
      await expect(page.getByRole("group", { name: "Would you order Lancha tea again?" })).toBeVisible();
      const review = page.locator("form").filter({ has: page.getByRole("group", { name: "How was your visit?" }) });
      await review.getByRole("radio", { name: "Great", exact: true }).check();
      await review.getByRole("button", { name: "Submit review", exact: true }).click();
      await expect(page.getByText("Review sent. How was your visit?")).toBeVisible();
    } finally {
      await device.close();
    }
  } finally {
    await staff.close();
  }
});
