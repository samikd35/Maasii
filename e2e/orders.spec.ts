import { uniquePhone } from "../tests/support/users";
import { expect, test, type Browser, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { addPaymentOption, createWaiterJoinCode, endShift, getShiftSetup, startShift, type MenuInput } from "@/core";
import { sampleMenu, scenario } from "../tests/support/scenario";

async function service(browser: Browser, baseURL: string, use: object, menu?: MenuInput) {
  const s = await scenario().venue("Lancha", { tables: 2 }).publishedMenu(menu).build();
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl: baseURL });
  const context = await browser.newContext({ ...use, baseURL });
  const waiter = await context.newPage();
  await waiter.goto(url);
  await waiter.getByRole("button", { name: "EN", exact: true }).click();
  await waiter.getByLabel("Name").fill("Sam");
  await waiter.getByLabel("Phone number").fill(uniquePhone());
  await waiter.getByLabel("Choose a 6-digit PIN").fill("042731");
  await waiter.getByRole("button", { name: "Join venue" }).click();
  await waiter.waitForURL("**/staff");
  await expect(waiter.getByRole("heading", { name: "Order queue", exact: true })).toBeVisible();

  const setup = await getShiftSetup(s.owner.actor, { venueId: s.venue.id });
  const assignment = { tableId: s.venue.tables[0].id, waiterId: setup.waiters[0].id };
  const shift = await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [assignment] });
  await expect(waiter.getByRole("heading", { name: "Order queue" })).toBeVisible();
  return { waiter, context, url: `/v/${s.venue.linkToken}/menu`, s, shift, assignment };
}

async function openWaiterTable(waiter: Page, number: number) {
  await waiter.getByRole("link", { name: "Tables", exact: true }).click();
  await waiter.getByRole("link", { name: new RegExp(`^Table ${number}(?: |$)`) }).click();
}

async function openDraft(page: Page, url: string, dish = "Omelette") {
  await page.goto(url);
  await page.getByRole("button", { name: `Choose ${dish}`, exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("button", { name: /Your Draft/ }).click();
}

async function pickDishAndSend(page: Page, url: string) {
  await openDraft(page, url);
  await page.getByRole("button", { name: "Choose your table", exact: true }).click();
  await expect(page.getByRole("button", { name: "Table 1", exact: true })).toBeVisible();
}

test("a guest chooses a Table, the assigned Waiter sees the Order live and the guest sees Accept, the Bill and its payment confirmation", async ({ page, browser, baseURL, browserName }) => {
  const { waiter, context, url, s } = await service(browser, baseURL!, test.info().project.use);
  try {
    await addPaymentOption(s.owner.actor, {
      venueId: s.venue.id, kind: "bank_transfer", provider: "Test Bank", recipientName: "Lancha Café",
      accountOrMerchantCode: "001234", qrImage: await QRCode.toDataURL("test-payment-destination"), displayOrder: 1,
    });
    await pickDishAndSend(page, url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await expect(page.getByRole("button", { name: "Table 1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Sent", { exact: true })).toBeVisible();
    const queue = waiter.getByRole("region", { name: "Order queue" });
    await expect(queue.getByRole("button", { name: "Accept" })).toBeVisible({ timeout: 6000 });
    await expect(queue.getByText("Omelette", { exact: true })).toBeVisible();
    await expect(queue.getByText("ኦምሌት", { exact: true })).toBeVisible();
    await queue.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("dialog").getByText("Accepted by Sam", { exact: true })).toBeVisible({ timeout: 6000 });
    await page.reload();
    await page.getByRole("button", { name: /Your table.*Table 1/ }).click();
    await expect(page.getByRole("dialog").getByText("Accepted by Sam", { exact: true })).toBeVisible();

    const sheet = page.getByRole("dialog");
    await openWaiterTable(waiter, 1);
    const prepare = waiter.getByRole("button", { name: "Prepare bill" });
    await expect(prepare).toBeVisible();
    await prepare.click();
    const bill = sheet.getByRole("region", { name: "Bill", exact: true });
    await expect(bill.getByText("Not a tax receipt")).toBeVisible({ timeout: 6000 });
    await expect(bill.getByText("Waiting for your Waiter to confirm payment")).toBeVisible();
    await expect(bill.getByText("1 × Omelette")).toBeVisible();
    await expect(bill.getByRole("region", { name: "Bill total" }).getByTestId("price")).toHaveText("220 ETB");
    const paymentOptions = sheet.getByRole("region", { name: "Payment Options" });
    await expect(paymentOptions.getByText("Test Bank")).toBeVisible();
    await expect(paymentOptions.getByText("Lancha Café")).toBeVisible();
    await expect(paymentOptions.getByText("001234")).toBeVisible();
    await expect(paymentOptions.getByRole("img", { name: "Payment QR image" })).toBeVisible();
    if (browserName === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    await page.bringToFront();
    await paymentOptions.getByRole("button", { name: "Copy account number or merchant code" }).click();
    await expect(paymentOptions.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("001234");
    } else {
      // WebKit has no Playwright clipboard permission API. Exercise the manual-copy fallback.
      await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } } }));
      await paymentOptions.getByRole("button", { name: "Copy account number or merchant code" }).click();
      await expect(paymentOptions.getByRole("status").filter({ hasText: "Could not copy" })).toBeVisible();
    }

    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Choose Macchiato", exact: true }).click();
    await page.getByRole("button", { name: "Add to order" }).click();
    await page.getByRole("button", { name: /Your Draft/ }).click();
    await expect(sheet.getByText("Ask your waiter to reopen the Bill to add an Order.")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Choose your table", exact: true })).toBeDisabled();
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.getByRole("link", { name: "Continue your order", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View your bill", exact: true }).click();
    await expect(sheet.getByRole("heading", { name: "Bill", exact: true })).toBeFocused();
    await expect(bill.getByText("1 × Omelette")).toBeVisible();


    await waiter.getByRole("button", { name: "Enter receipt" }).click();
    const entry = waiter.getByRole("dialog", { name: "Enter receipt for Table 1" });
    const amount = entry.getByLabel("Official Receipt amount (ETB)");
    await expect(amount).toHaveValue("");
    await entry.getByLabel("Method").selectOption({ label: "Test Bank · 001234" });
    await amount.fill("1.234");
    await expect(amount).not.toHaveAttribute("aria-invalid", "true");
    await amount.blur();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAccessibleDescription(/Enter/);
    await entry.getByRole("button", { name: "Record payment" }).click();
    await expect(amount).toBeFocused();
    await amount.fill("219.75");
    await expect(amount).not.toHaveAttribute("aria-invalid", "true");
    await expect(entry.getByText("Receipt Difference: −0.25 ETB")).toBeVisible();
    await entry.getByRole("button", { name: "Record payment" }).click();
    await expect(sheet.getByText("Bill paid", { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(bill.getByText("1 × Omelette")).toBeVisible();
    await expect(paymentOptions).toHaveCount(0);
    await expect(waiter.getByText("Payment recorded · Table 1", { exact: true })).toBeVisible();
    await expect(waiter.getByText("No active orders", { exact: true })).toBeVisible();

    const reviews = sheet.getByRole("region", { name: "Reviews" });
    const visitReview = reviews.locator("form").filter({ has: page.getByRole("group", { name: "How was your visit?" }) });
    await expect(visitReview.getByText("Shared privately with Test Brand")).toBeVisible();
    await visitReview.getByRole("radio", { name: "Great" }).check();
    await visitReview.getByRole("checkbox", { name: "Food overall" }).check();
    await visitReview.getByLabel("Comment (optional)").fill("Great breakfast.");
    await visitReview.getByRole("button", { name: "Submit review" }).click();
    await expect(reviews.getByText("Review sent. How was your visit?")).toBeVisible();
    await reviews.getByText("Tell us about a dish · optional", { exact: true }).click();
    await reviews.getByRole("checkbox", { name: "Omelette", exact: true }).check();
    const dishReview = reviews.locator("form").filter({ has: page.getByRole("group", { name: "Would you order Omelette again?" }) });
    await dishReview.getByRole("button", { name: "Skip" }).click();
    await expect(dishReview).toHaveCount(0);
    await reviews.getByText("Tell us about the service · optional", { exact: true }).click();
    await expect(reviews.getByRole("group", { name: "How was the service from Sam?" })).toBeVisible();

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
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();

    const first = page.getByRole("dialog");
    const second = other.getByRole("dialog");
    const bill = (sheet: typeof first) => sheet.getByRole("region", { name: /^(Bill total|Accepted running total)$/ }).getByTestId("price");
    await expect(first.getByText("1 × Omelette", { exact: true })).toBeVisible();
    await expect(first.getByText("Chechebsa", { exact: false })).toHaveCount(0);
    await expect(second.getByText("Omelette", { exact: false })).toHaveCount(0);
    await expect(bill(first)).toHaveCount(0);
    await expect(first.getByRole("region", { name: "Submitted amount" }).getByTestId("price")).toHaveText("220 ETB");

    await second.getByRole("button", { name: "Choose your table", exact: true }).click();
    await second.getByRole("button", { name: "Table 1", exact: true }).click();
    await second.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    await expect(first.getByText("1 × Chechebsa", { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(second.getByText("1 × Omelette", { exact: true })).toBeVisible();
    await expect(first.getByText("Sent", { exact: true })).toHaveCount(2);
    await expect(second.getByText("Sent", { exact: true })).toHaveCount(2);
    await expect(bill(second)).toHaveCount(0);
    await expect(second.getByRole("region", { name: "Submitted amount" }).getByTestId("price")).toHaveText("410 ETB");

    await first.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Choose Macchiato", exact: true }).click();
    await page.getByRole("button", { name: "Add to order" }).click();
    await page.getByRole("button", { name: /Your Draft/ }).click();
    await expect(first.getByRole("heading", { name: "Draft · not sent yet" })).toBeVisible();
    await expect(first.getByText("Macchiato", { exact: true })).toBeVisible();
    await expect(second.getByText("Macchiato", { exact: false })).toHaveCount(0);

    const queue = staff.waiter.getByRole("region", { name: "Order queue" });
    await expect(queue.getByRole("button", { name: "Review order" })).toHaveCount(1, { timeout: 6000 });
    await queue.getByRole("button", { name: "Accept" }).click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByText("Accepted by Sam", { exact: true })).toHaveCount(1, { timeout: 6000 });
      await expect(bill(sheet)).toHaveText("220 ETB");
    }
    await queue.getByRole("button", { name: "Review order" }).click();
    await queue.getByRole("button", { name: "Accept" }).click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByText("Accepted by Sam", { exact: true })).toHaveCount(2, { timeout: 6000 });
      await expect(bill(sheet)).toHaveText("410 ETB");
    }

    await openWaiterTable(staff.waiter, 1);
    await staff.waiter.getByRole("button", { name: "Prepare bill" }).click();
    for (const sheet of [first, second]) {
      await expect(sheet.getByRole("region", { name: "Bill", exact: true }).getByText("Not a tax receipt")).toBeVisible({ timeout: 6000 });
      await expect(bill(sheet)).toHaveText("410 ETB");
    }
    await staff.waiter.getByText("Bill actions", { exact: true }).click();
    await staff.waiter.getByRole("button", { name: "Reopen bill" }).click();
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
      await page.getByRole("button", { name: `Choose ${dish}`, exact: true }).click();
      await page.getByRole("button", { name: "Add to order" }).click();
    }
    await page.getByRole("button", { name: /Your Draft/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Choose your table", exact: true }).click();
    await sheet.getByRole("button", { name: "Table 1", exact: true }).click();
    await sheet.getByRole("button", { name: "Send to Table 1", exact: true }).click();

    const queue = waiter.getByRole("region", { name: "Order queue" });
    const actions = waiter.getByRole("dialog", { name: "Order actions · Table 1" });
    await queue.getByText("More actions", { exact: true }).click({ timeout: 6000 });
    await actions.getByRole("button", { name: "Decline Order" }).click();
    await expect(sheet.getByText("Declined. Please speak to your waiter.", { exact: true })).toBeVisible({ timeout: 4000 });
    await queue.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(sheet.getByText("Sent", { exact: true })).toBeVisible({ timeout: 6000 });

    await queue.getByText("Item unavailable", { exact: true }).click();
    const unavailable = waiter.getByRole("dialog", { name: "Items unavailable · Table 1" });
    await unavailable.getByRole("checkbox", { name: "Omelette sold out" }).check();
    await unavailable.getByRole("button", { name: /^Accept / }).click();
    await expect(sheet.getByText("Accepted by Sam", { exact: true })).toBeVisible({ timeout: 6000 });
    const dropped = sheet.getByRole("listitem").filter({ hasText: "1 × Omelette" }).last();
    await expect(dropped.getByText("Sold out", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Accepted running total" }).getByTestId("price")).toHaveText("190 ETB");
    await expect(queue.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(queue.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0, { timeout: 6000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Choose Omelette", exact: true })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    const retry = page.getByRole("button", { name: "Check Order again" });
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
    const send = page.getByRole("button", { name: "Choose your table", exact: true });
    await expect(send).toBeDisabled();
    await expect(page.getByText("Online ordering is unavailable right now. Please order with your Waiter.")).toBeVisible();

    await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [assignment] });
    await expect(send).toBeEnabled({ timeout: 15_000 });
    await send.click();
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
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
    const queue = waiter.getByRole("region", { name: "Order queue" });
    await pickDishAndSend(page, url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    await queue.getByRole("button", { name: /^Accept / }).click();
    await openWaiterTable(waiter, 1);
    await waiter.getByRole("button", { name: "Prepare bill" }).click();
    const original = page.getByRole("dialog");
    await expect(original.getByText("Not a tax receipt")).toBeVisible();
    await waiter.goto("/staff");

    const next = await nextContext.newPage();
    await pickDishAndSend(next, url);
    await next.getByRole("button", { name: "Table 1", exact: true }).click();
    await next.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    const nextSheet = next.getByRole("dialog");
    await expect(nextSheet.getByText("Order sent. Your waiter will check the Table.")).toBeVisible();
    await expect(nextSheet.getByText("Not a tax receipt")).toHaveCount(0);
    const newParty = queue.getByRole("listitem").filter({ has: waiter.getByText("New party at Table 1?", { exact: true }) });
    await expect(newParty.getByRole("button", { name: "Reopen bill for the same guests" })).toBeVisible();
    await newParty.getByRole("button", { name: "Record previous party’s receipt" }).click();
    const receipt = waiter.getByRole("dialog", { name: "Previous party’s receipt · Table 1" });
    await expect(receipt.getByLabel("Official Receipt amount (ETB)")).toHaveValue("");
    await receipt.getByLabel("Method").selectOption({ label: "Cash" });
    await receipt.getByLabel("Official Receipt amount (ETB)").fill("220");
    await receipt.getByRole("button", { name: "Record payment" }).click();
    await expect(original.getByText("Bill paid", { exact: true })).toBeVisible();
    await expect(nextSheet.getByText("Sent", { exact: true })).toBeVisible();
    await expect(nextSheet.getByText("Not a tax receipt")).toHaveCount(0);
  } finally {
    await Promise.all([context.close(), nextContext.close()]);
  }
});

test("an Owner adjusts a live Bill and reconciles the typed receipt at closing", async ({ page, browser, baseURL }) => {
  const { waiter, context, url, s } = await service(browser, baseURL!, test.info().project.use);
  const management = await browser.newContext({ ...test.info().project.use, baseURL });
  try {
    await pickDishAndSend(page, url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    await waiter.getByRole("button", { name: /^Accept / }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Accepted by Sam", { exact: true })).toBeVisible();

    const owner = await management.newPage();
    await owner.goto("/sign-in");
    const english = owner.getByRole("button", { name: "EN", exact: true });
    if (await english.getAttribute("aria-pressed") === "false") await english.click();
    await owner.getByLabel("Email or phone").fill(s.owner.email);
    await owner.getByLabel("Password").fill(s.owner.password);
    await owner.getByRole("button", { name: "Sign in", exact: true }).click();
    await owner.getByRole("link", { name: "Lancha", exact: true }).click();
    await owner.getByRole("link", { name: "Closing", exact: true }).click();
    const visits = owner.getByRole("region", { name: "Open Visits" });
    await visits.getByText("Visit actions", { exact: true }).click();
    await visits.getByText("Adjust Bill", { exact: true }).click();
    const discount = visits.locator("form").filter({ has: owner.getByLabel("Discount amount (ETB)") });
    await discount.getByLabel("Discount amount (ETB)").fill("20");
    await discount.getByLabel("Reason").fill("Service recovery");
    await discount.getByRole("button", { name: "Save discount" }).click();
    await expect(sheet.getByRole("region", { name: "Accepted running total" }).getByTestId("price")).toHaveText("200 ETB");
    await expect(visits.getByText("Discount: 20 ETB · Service recovery")).toBeVisible();

    await visits.getByRole("button", { name: "Prepare bill" }).click();
    await visits.getByRole("button", { name: "Enter receipt" }).click();
    await visits.getByLabel("Method").selectOption({ label: "Cash" });
    const amount = visits.getByLabel("Official Receipt amount (ETB)");
    await expect(amount).toHaveValue("");
    await amount.fill("199");
    await visits.getByRole("button", { name: "Record Payment Confirmation" }).click();
    await expect(sheet.getByText("Bill paid", { exact: true })).toBeVisible();
    await expect(visits.getByText("There are no open Visits.")).toBeVisible();
    await owner.getByRole("link", { name: "Daily Payment Confirmations" }).click();
    await expect(owner.getByRole("region", { name: "Daily Payment Confirmations" }).getByText("-1 ETB", { exact: true }).first()).toBeVisible();
    await owner.getByText("Adjustments on closed Visits").click();
    await expect(owner.getByText("Discount: 20 ETB · Service recovery")).toBeVisible();
  } finally {
    await Promise.all([context.close(), management.close()]);
  }
});

test("a Waiter quick-adds a spoken Order with options and corrects its running Bill", async ({ browser, baseURL }) => {
  const menu = structuredClone(sampleMenu);
  menu.sections[0].dishes[0].optionGroups = [{
    name: "Egg preparation", kind: "choose_one", required: true,
    choices: [{ name: "Soft", priceChangeSantim: 1_000 }, { name: "Firm" }],
  }];
  const { waiter, context } = await service(browser, baseURL!, test.info().project.use, menu);
  try {
    await waiter.getByRole("link", { name: "Tables", exact: true }).click();
    await waiter.getByRole("link", { name: /^Table 1 No active orders$/ }).click();
    await waiter.getByRole("link", { name: "Add a Dish" }).click();
    await waiter.getByLabel("Search Dishes").fill("ኦምሌት");
    await expect(waiter.getByRole("button", { name: /Chechebsa/ })).toHaveCount(0);
    await waiter.getByRole("button", { name: /Omelette/ }).click();
    await waiter.getByLabel("Egg preparation").selectOption({ label: "Soft (+10)" });
    await waiter.getByLabel("Quantity").fill("2");
    await waiter.getByLabel("Note", { exact: true }).fill("Serve together");
    await waiter.getByRole("link", { name: "Back to Table 1", exact: true }).click();
    await waiter.getByRole("link", { name: "Add a Dish" }).click();
    await expect(waiter.getByRole("status")).toHaveText("Your dish draft was restored.");
    await expect(waiter.getByLabel("Note", { exact: true })).toHaveValue("Serve together");
    await expect(waiter.locator(".waiter-task-footer").getByTestId("price")).toHaveText("460 ETB");
    await waiter.route("**/staff/orders", async route => {
      if (route.request().method() !== "POST") return route.continue();
      expect((await route.fetch()).status()).toBe(200);
      await route.abort();
    });
    await waiter.getByRole("button", { name: "Add to Table 1" }).click();
    const retry = waiter.getByRole("button", { name: "Retry adding to Table 1" });
    await expect(retry).toBeVisible();
    await waiter.reload();
    await expect(retry).toBeVisible();
    await expect(waiter.getByLabel("Note", { exact: true })).toHaveValue("Serve together");
    await waiter.unroute("**/staff/orders");
    await retry.click();
    await expect(waiter.getByText("Waiter-entered Order", { exact: true })).toBeVisible();
    await expect(waiter.getByText("Accepted by Sam", { exact: true })).toBeVisible();
    await expect(waiter.getByText("Serve together")).toBeVisible();
    await expect(waiter.getByText(/460 ETB/)).toBeVisible();
    await expect(waiter.getByText("Waiter-entered Order", { exact: true })).toHaveCount(1);
    await waiter.getByText("Edit dish", { exact: true }).click();
    const correction = waiter.getByRole("dialog", { name: "Correct dish · Table 1" });
    await correction.getByLabel("Quantity").fill("1");
    await correction.getByLabel("Reason", { exact: true }).fill("Guest only needs one");
    await correction.getByRole("button", { name: "Save quantity" }).click();
    await expect(correction).toHaveCount(0);
    await expect(waiter.getByText(/230 ETB/)).toBeVisible();

    await waiter.getByRole("link", { name: "Add a Dish" }).click();
    await expect(waiter.getByRole("heading", { name: "Recent dishes" })).toBeVisible();
    await expect(waiter.getByRole("button", { name: /Omelette/ })).toBeVisible();
    await waiter.getByRole("link", { name: "Back to Table 1", exact: true }).click();
    await waiter.getByRole("button", { name: "Prepare bill" }).click();
    await expect(waiter.getByRole("link", { name: "Add a Dish" })).toHaveCount(0);
    await expect(waiter.getByText("Edit dish", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a Waiter can move a Sent Order, and its guest can change Table before Accept", async ({ page, browser, baseURL }) => {
  const { waiter, context, url } = await service(browser, baseURL!, test.info().project.use);
  try {
    await pickDishAndSend(page, url);
    await page.getByRole("button", { name: "Table 1", exact: true }).click();
    await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
    const slip = page.getByRole("dialog");
    await expect(slip.getByRole("button", { name: "Change Table" })).toBeVisible();
    const queue = waiter.getByRole("region", { name: "Order queue" });
    await queue.getByText("More actions", { exact: true }).click();
    const actions = waiter.getByRole("dialog", { name: "Order actions · Table 1" });
    await actions.getByText("Move this Order…", { exact: true }).click();
    await actions.getByLabel("Move this Order…").selectOption({ label: "Table 2" });
    await actions.getByRole("button", { name: "Move to Table 2", exact: true }).click();
    await expect(slip.getByRole("heading", { name: /Your table.*Table 2/ })).toBeVisible();
    await slip.getByRole("button", { name: "Change Table" }).click();
    await slip.getByRole("button", { name: "Table 1", exact: true }).click();
    await slip.getByRole("button", { name: "Confirm Table 1", exact: true }).click();
    await expect(slip.getByRole("heading", { name: /Your table.*Table 1/ })).toBeVisible();
    await expect(queue.getByRole("link", { name: "Table 1", exact: true })).toBeVisible();
    await queue.getByRole("button", { name: /^Accept / }).click();
    await expect(slip.getByText("Accepted by Sam", { exact: true })).toBeVisible();
    await expect(slip.getByRole("button", { name: "Change Table" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
