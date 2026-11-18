import type { Page } from "@playwright/test";

export async function publishDraft(page: Page) {
  await page.getByRole("button", { name: "Review and publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Publish (Brand Menu|to )/ }).click();
}
