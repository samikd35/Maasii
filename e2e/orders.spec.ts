import { expect, test, type Browser, type Page } from "@playwright/test";
import { createWaiterJoinCode, endShift, getShiftSetup, startShift } from "@/core";
import { scenario } from "../tests/support/scenario";

async function service(browser: Browser, baseURL: string, use: object) {
  const s = await scenario().venue("Lancha", { tables: 2 }).publishedMenu().build();
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl: baseURL });
  const context = await browser.newContext({ ...use, baseURL });
  const waiter = await context.newPage();
  await waiter.goto(url);
  await waiter.getByRole("button", { name: "EN", exact: true }).click();
  await waiter.getByLabel("Name").fill("Sam");
  await waiter.getByLabel("Choose a 4-digit PIN").fill("0427");
  await waiter.getByRole("button", { name: "Join venue" }).click();
  await waiter.waitForURL("**/staff");
  await expect(waiter.getByRole("heading", { name: "Lancha", exact: true })).toBeVisible();

  const setup = await getShiftSetup(s.owner.actor, { venueId: s.venue.id });
  const assignment = { tableId: s.venue.tables[0].id, waiterId: setup.waiters[0].id };
  const shift = await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [assignment] });
  await expect(waiter.getByRole("heading", { name: "My tables" })).toBeVisible();
  return { waiter, context, url: `/v/${s.venue.linkToken}`, s, shift, assignment };
}

async function openDraft(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Omelette", exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("button", { name: /Your Draft/ }).click();
}

async function pickDishAndSend(page: Page, url: string) {
  await openDraft(page, url);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Table 1", exact: true })).toBeVisible();
}

test("a guest chooses a Table, the assigned Waiter sees the Order live and the guest sees one-tap Accept", async ({ page, browser, baseURL }) => {
  const { waiter, context, url } = await service(browser, baseURL!, test.info().project.use);
  try {
    await pickDishAndSend(page, url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Sent", { exact: true })).toBeVisible();
    const queue = waiter.getByRole("region", { name: "My tables" });
    await expect(queue.getByRole("button", { name: "Accept" })).toBeVisible({ timeout: 6000 });
    await expect(queue.getByText("ኦምሌት", { exact: true })).toBeVisible();
    await queue.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("dialog").getByText("Accepted by Sam", { exact: true })).toBeVisible({ timeout: 6000 });
    await page.reload();
    await page.getByRole("button", { name: /Your table.*Table 1/ }).click();
    await expect(page.getByRole("dialog").getByText("Accepted by Sam", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("offline Send keeps the Draft and a lost acknowledgement can be retried without a duplicate", async ({ page, context, browser, baseURL }) => {
  const staff = await service(browser, baseURL!, test.info().project.use);
  try {
    await pickDishAndSend(page, staff.url);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    const retry = page.getByRole("button", { name: "Not sent - tap to retry" });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Omelette", { exact: true })).toBeVisible();
    await context.setOffline(false);

    await page.route("**/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const saved = await route.fetch();
      expect(saved.ok()).toBe(true);
      await route.abort();
    });
    await retry.click();
    await expect(staff.waiter.getByRole("button", { name: "Accept" })).toHaveCount(1);
    await expect(retry).toBeVisible();
    await page.unroute("**/orders");
    await retry.click();
    await expect(page.getByRole("dialog").getByText("Sent", { exact: true })).toBeVisible();
    await expect(staff.waiter.getByRole("button", { name: "Accept" })).toHaveCount(1);
  } finally {
    await staff.context.close();
  }
});

test("a guest can browse while service is off and still sees Accept when Realtime is unavailable", async ({ page, browser, baseURL }) => {
  test.setTimeout(45_000);
  const staff = await service(browser, baseURL!, test.info().project.use);
  try {
    const { s, shift, assignment } = staff;
    await endShift(s.owner.actor, { venueId: s.venue.id, shiftId: shift.id });
    await page.routeWebSocket("**/realtime/v1/websocket*", (socket) => socket.close());
    await openDraft(page, staff.url);
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    await expect(page.getByText("Ordering is unavailable until a Shift starts.")).toBeVisible();

    await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [assignment] });
    await expect(send).toBeEnabled({ timeout: 15_000 });
    await send.click();
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Sent", { exact: true })).toBeVisible();
    await staff.waiter.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("dialog").getByText("Accepted by Sam", { exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    await staff.context.close();
  }
});
