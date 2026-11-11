import { expect, test, type Browser, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { addPaymentOption, createWaiterJoinCode, endShift, getShiftSetup, startShift } from "@/core";
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

async function openDraft(page: Page, url: string, dish = "Omelette") {
  await page.goto(url);
  await page.getByRole("button", { name: dish, exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("button", { name: /Your Draft/ }).click();
}

async function pickDishAndSend(page: Page, url: string) {
  await openDraft(page, url);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Table 1", exact: true })).toBeVisible();
}

test("a guest chooses a Table, the assigned Waiter sees the Order live and the guest sees Accept, the Bill and its payment confirmation", async ({ page, browser, baseURL }) => {
  const { waiter, context, url, s } = await service(browser, baseURL!, test.info().project.use);
  try {
    await addPaymentOption(s.owner.actor, {
      venueId: s.venue.id, kind: "bank_transfer", provider: "Test Bank", recipientName: "Lancha Café",
      accountOrMerchantCode: "001234", qrImage: await QRCode.toDataURL("test-payment-destination"), displayOrder: 1,
    });
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

    const sheet = page.getByRole("dialog");
    const prepare = queue.getByRole("button", { name: "Prepare bill" });
    await expect(prepare).toBeVisible();
    await prepare.click();
    const bill = sheet.getByRole("region", { name: "Bill", exact: true });
    await expect(bill.getByText("Not a tax receipt")).toBeVisible({ timeout: 6000 });
    await expect(bill.getByText("1 × Omelette")).toBeVisible();
    await expect(bill.getByRole("region", { name: "Bill total" }).getByTestId("price")).toHaveText("220 ETB");
    const paymentOptions = sheet.getByRole("region", { name: "Payment Options" });
    await expect(paymentOptions.getByText("Test Bank")).toBeVisible();
    await expect(paymentOptions.getByText("Lancha Café")).toBeVisible();
    await expect(paymentOptions.getByText("001234")).toBeVisible();
    await expect(paymentOptions.getByRole("img", { name: "Payment QR image" })).toBeVisible();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    await page.bringToFront();
    await paymentOptions.getByRole("button", { name: "Copy account number or merchant code" }).click();
    await expect(paymentOptions.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("001234");

    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Macchiato", exact: true }).click();
    await page.getByRole("button", { name: "Add to order" }).click();
    await page.getByRole("button", { name: /Your Draft/ }).click();
    await expect(sheet.getByText("Ask your waiter to reopen the Bill to add an Order.")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Send", exact: true })).toBeDisabled();

    await queue.getByRole("button", { name: "Confirm payment" }).click();
    const amount = queue.getByLabel("Official Receipt amount (ETB)");
    await expect(amount).toHaveValue("");
    await queue.getByLabel("Method").selectOption({ label: "Test Bank · 001234" });
    await amount.fill("219.75");
    await expect(queue.getByText("Receipt Difference: −0.25 ETB")).toBeVisible();
    await queue.getByRole("button", { name: "Record Payment Confirmation" }).click();
    await expect(sheet.getByText("Bill paid", { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(bill.getByText("1 × Omelette")).toBeVisible();
    await expect(paymentOptions).toHaveCount(0);
    await expect(queue.getByText("No orders at your tables.")).toBeVisible();

  } finally {
    await context.close();
  }
});

test("two guest phones share live Orders and the Bill while each Draft stays on its phone", async ({ page, browser, baseURL }) => {
  const use = test.info().project.use;
  const staff = await service(browser, baseURL!, use);
  const context = await browser.newContext({ ...use, baseURL });
  try {
    const other = await context.newPage();
    await openDraft(other, staff.url, "Chechebsa");
    await pickDishAndSend(page, staff.url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();

    const first = page.getByRole("dialog");
    const second = other.getByRole("dialog");
    const bill = (sheet: typeof first) => sheet.getByRole("region", { name: "Bill total" }).getByTestId("price");
    await expect(first.getByText("1 × Omelette", { exact: true })).toBeVisible();
    await expect(first.getByText("Chechebsa", { exact: false })).toHaveCount(0);
    await expect(second.getByText("Omelette", { exact: false })).toHaveCount(0);
    await expect(bill(first)).toHaveText("0 ETB");

    await second.getByRole("button", { name: "Send", exact: true }).click();
    await second.getByRole("button", { name: "Table 1", exact: true }).click();
    await expect(first.getByText("1 × Chechebsa", { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(second.getByText("1 × Omelette", { exact: true })).toBeVisible();
    await expect(first.getByText("Sent", { exact: true })).toHaveCount(2);
    await expect(second.getByText("Sent", { exact: true })).toHaveCount(2);
    await expect(bill(second)).toHaveText("0 ETB");

    await first.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Macchiato", exact: true }).click();
    await page.getByRole("button", { name: "Add to order" }).click();
    await page.getByRole("button", { name: /Your Draft/ }).click();
    await expect(first.getByRole("heading", { name: "Draft · not sent yet" })).toBeVisible();
    await expect(first.getByText("Macchiato", { exact: true })).toBeVisible();
    await expect(second.getByText("Macchiato", { exact: false })).toHaveCount(0);

    const queue = staff.waiter.getByRole("region", { name: "My tables" });
    await expect(queue.getByRole("button", { name: "Accept" })).toHaveCount(2, { timeout: 6000 });
    await queue.getByRole("button", { name: "Accept" }).first().click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByText("Accepted by Sam", { exact: true })).toHaveCount(1, { timeout: 6000 });
      await expect(bill(sheet)).toHaveText("220 ETB");
    }
    await queue.getByRole("button", { name: "Accept" }).click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByText("Accepted by Sam", { exact: true })).toHaveCount(2, { timeout: 6000 });
      await expect(bill(sheet)).toHaveText("410 ETB");
    }

    await queue.getByRole("button", { name: "Prepare bill" }).click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByRole("region", { name: "Bill", exact: true }).getByText("Not a tax receipt")).toBeVisible({ timeout: 6000 });
      await expect(bill(sheet)).toHaveText("410 ETB");
    }
    await queue.getByRole("button", { name: "Reopen bill" }).click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByText("Not a tax receipt")).toHaveCount(0, { timeout: 6000 });
      await expect(bill(sheet)).toHaveText("410 ETB");
    }
  } finally {
    await context.close();
    await staff.context.close();
  }
});

test("a waiter can drop a Sold Out Dish and undo a whole Decline while the guest sees both live", async ({ page, browser, baseURL }) => {
  const { waiter, context, url } = await service(browser, baseURL!, test.info().project.use);
  try {
    await page.goto(url);
    for (const dish of ["Omelette", "Chechebsa"]) {
      await page.getByRole("button", { name: dish, exact: true }).click();
      await page.getByRole("button", { name: "Add to order" }).click();
    }
    await page.getByRole("button", { name: /Your Draft/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    await sheet.getByRole("button", { name: "Table 1", exact: true }).click();

    const queue = waiter.getByRole("region", { name: "My tables" });
    await queue.getByText("Order decisions", { exact: true }).click({ timeout: 6000 });
    await queue.getByRole("button", { name: "Decline Order" }).click();
    await expect(sheet.getByText("Declined. Please speak to your waiter.", { exact: true })).toBeVisible({ timeout: 4000 });
    await queue.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(sheet.getByText("Sent", { exact: true })).toBeVisible({ timeout: 6000 });

    await queue.getByText("Order decisions", { exact: true }).click();
    await queue.getByRole("checkbox", { name: "Omelette sold out" }).check();
    await queue.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(sheet.getByText("Accepted by Sam", { exact: true })).toBeVisible({ timeout: 6000 });
    const dropped = sheet.getByRole("listitem").filter({ hasText: "1 × Omelette" }).last();
    await expect(dropped.getByText("Sold out", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Bill total" }).getByTestId("price")).toHaveText("190 ETB");
    await expect(queue.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(queue.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0, { timeout: 6000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Omelette", exact: true })).toHaveCount(0);
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

test("a new phone can Send at a prepared Table while the Waiter confirms the previous party paid", async ({ page, browser, baseURL }) => {
  const { waiter, context, url } = await service(browser, baseURL!, test.info().project.use);
  const nextContext = await browser.newContext({ ...test.info().project.use, baseURL });
  try {
    const queue = waiter.getByRole("region", { name: "My tables" });
    await pickDishAndSend(page, url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await queue.getByRole("button", { name: "Accept", exact: true }).click();
    await queue.getByRole("button", { name: "Prepare bill" }).click();
    const original = page.getByRole("dialog");
    await expect(original.getByText("Not a tax receipt")).toBeVisible();

    const next = await nextContext.newPage();
    await pickDishAndSend(next, url);
    await next.getByRole("button", { name: "Table 1", exact: true }).click();
    const nextSheet = next.getByRole("dialog");
    await expect(nextSheet.getByText("Order sent. Your waiter will check the Table.")).toBeVisible();
    await expect(nextSheet.getByText("Not a tax receipt")).toHaveCount(0);
    await expect(queue.getByText("New party at Table 1?")).toBeVisible();
    await queue.getByRole("button", { name: "Previous party paid" }).click();
    await expect(queue.getByLabel("Official Receipt amount (ETB)")).toHaveValue("");
    await queue.getByLabel("Method").selectOption({ label: "Cash" });
    await queue.getByLabel("Official Receipt amount (ETB)").fill("220");
    await queue.getByRole("button", { name: "Record Payment Confirmation" }).click();
    await expect(original.getByText("Bill paid", { exact: true })).toBeVisible();
    await expect(nextSheet.getByText("Sent", { exact: true })).toBeVisible();
    await expect(nextSheet.getByText("Not a tax receipt")).toHaveCount(0);
  } finally {
    await Promise.all([context.close(), nextContext.close()]);
  }
});
