import { uniquePhone } from "../tests/support/users";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptOrder, addBrandOwner, adjustVisitBill, confirmPayment, createWaiterJoinCode, getClosingReport, getPublishedMenu,
  getVenueMenuDraft, guestActor, prepareBill, publicActor, saveVenueMenu, sendOrder, startShift, systemActor, updateVenueService,
} from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario, type Scenario } from "../tests/support/scenario";

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
});

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function sendAt(s: Scenario, number: number, dishes = [{ name: "Omelette", quantity: 1, note: "No onions" }], now?: Date) {
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Could not start the guest session");
  return sendOrder(guestActor(data.user.id), {
    venueLinkToken: s.venue.linkToken, tableId: s.venue.tables[number - 1].id, requestId: randomUUID(),
    lines: dishes.map(({ name, quantity, note }) => ({ dishId: s.dishId(name), quantity, note, choiceIds: [] })),
  }, { now });
}

test("a Waiter signs in with phone and PIN from a fresh browser", async ({ page, browser, baseURL }, info) => {
  const s = await scenario().venue("Lancha").build();
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl: baseURL! });
  const phone = uniquePhone();
  await page.goto(url);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mekdes");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Choose a 6-digit PIN").fill("042731");
  await page.getByRole("button", { name: "Join venue" }).click();
  await expect(page.getByRole("heading", { name: "Order queue" })).toBeVisible();

  const other = await browser.newContext({ ...info.project.use });
  try {
    const returning = await other.newPage();
    await returning.goto(new URL("/staff", baseURL).toString());
    await returning.getByRole("button", { name: "EN", exact: true }).click();
    await expect(returning.getByRole("heading", { name: "Waiter sign-in" })).toBeVisible();
    await returning.getByLabel("Phone number").fill(`0${phone.slice(4)}`);
    await returning.getByLabel("PIN", { exact: true }).fill("042731");
    await returning.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(returning.getByRole("heading", { name: "Order queue" })).toBeVisible();
    await expect(returning.getByText("Lancha · Mekdes", { exact: true })).toBeVisible();
    await returning.getByRole("button", { name: "Lock", exact: true }).click();
    await expect(returning.getByRole("heading", { name: "Unlock Maasii" })).toBeVisible();
    await returning.getByLabel("PIN", { exact: true }).fill("042731");
    await returning.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(returning.getByRole("heading", { name: "Order queue" })).toBeVisible();
  } finally {
    await other.close();
  }

  await page.goto(`/manage?brand=${s.brand.id}`);
  await expect(page.getByRole("heading", { name: "Switch accounts to continue" })).toBeVisible();
  await expect(page.getByText("The Brand workspace requires an Owner account.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Back to Waiter workspace" }).click();
  await expect(page.getByRole("heading", { name: "Order queue" })).toBeVisible();

  await page.goto(`/manage/operations?venue=${s.venue.id}`);
  await expect(page.getByText("Venue operations requires a Manager or Owner account.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sign out and switch account" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, s.owner);
  await expect(page).toHaveURL(`/manage/brands/${s.brand.id}`);
});

test("Staff keeps Order decisions, retries and receipt entry next to the affected work", async ({ page, baseURL }, info) => {
  const s = await scenario().venue("Lancha", { tables: 16 }).waiter("Mekdes").publishedMenu().build();
  const waiter = s.waiters.Mekdes;
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: s.venue.tables.map(table => ({ tableId: table.id, waiterId: waiter.waiterId })) });
  await sendAt(s, 1, [{ name: "Omelette", quantity: 2, note: "No onions" }, { name: "Macchiato", quantity: 3, note: "After the food" }]);
  for (const number of [2, 3, 4]) await sendAt(s, number);
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, waiterId: waiter.waiterId, siteUrl: baseURL! });
  await page.goto(url);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Phone number").fill(uniquePhone());
  await page.getByLabel("Choose a 6-digit PIN").fill("042731");
  await page.getByRole("button", { name: "Join venue" }).click();

  const queue = page.getByRole("region", { name: "Order queue" });
  const group = (number: number) => queue.getByRole("heading", { name: `Table ${number}`, exact: true }).locator("..");
  const firstAccept = group(1).getByRole("button", { name: "Accept Order" });
  await expect(firstAccept).toBeInViewport();
  await expect(group(1).getByText("“After the food”")).toBeInViewport();
  expect((await firstAccept.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const queueLink = page.getByRole("navigation", { name: "Waiter" }).getByRole("link", { name: "Queue" });
  await expect(queueLink).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: info.outputPath("staff-queue.png") });
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Menu", exact: true })).toBeVisible();
  await expect(queueLink).toHaveAccessibleDescription("4 Orders waiting");
  await page.getByLabel("Find a dish").fill("ኦምሌት");
  await expect(page.getByRole("main").getByTestId("price")).toHaveText("220 ETB");
  await queueLink.click();

  const fourth = group(4);
  await fourth.getByRole("button", { name: "Review order" }).click();
  await expect(firstAccept).toHaveCount(0);
  const accept = fourth.getByRole("button", { name: "Accept Order" });
  let canRefresh = false;
  await page.route("**/staff/orders", route => {
    if (route.request().method() === "POST") return route.fulfill({ status: 503 });
    return canRefresh ? route.continue() : route.abort();
  });
  await accept.click();
  await expect(fourth.getByRole("alert")).toContainText("Could not verify this action");
  await expect(accept).toBeDisabled();
  canRefresh = true;
  await fourth.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(fourth.getByRole("alert")).toContainText("Could not update the Order");
  await expect(fourth.getByRole("alert")).toBeInViewport();
  await page.unroute("**/staff/orders");
  await accept.click();
  const undo = fourth.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeInViewport();
  await undo.click();
  await expect(fourth.getByRole("button", { name: "Accept Order" })).toBeVisible();

  await group(1).getByRole("button", { name: "Review order" }).click();
  await group(1).getByRole("button", { name: "Item unavailable" }).click();
  const actions = page.getByRole("dialog", { name: "Items unavailable · Table 1" });
  await actions.getByRole("checkbox", { name: /Omelette sold out/ }).check();
  await expect(actions).toContainText("3 dishes to accept · 2 Sold Out");
  await actions.getByRole("button", { name: "Accept 3 dishes" }).click();
  await expect(actions).toHaveCount(0);

  await sendAt(s, 1, [{ name: "Chechebsa", quantity: 1, note: "Second round" }]);
  await page.getByRole("link", { name: "Tables", exact: true }).click();
  await page.getByRole("link", { name: "Table 1 New order" }).click();
  await expect(page.getByRole("link", { name: "Review 1 new order" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Prepare bill" })).toHaveCount(0);
  await page.getByRole("button", { name: "Accept Order" }).click();
  await page.getByRole("button", { name: "Prepare bill" }).click();
  const enter = page.getByRole("button", { name: "Enter receipt", exact: true });
  await enter.click();
  const receipt = page.getByRole("dialog", { name: "Enter receipt for Table 1" });
  await expect(receipt.getByLabel("Method")).toBeFocused();
  await expect(receipt.getByRole("button", { name: "Reopen bill" })).toHaveCount(0);
  await expect(receipt.getByLabel("Official Receipt amount (ETB)")).toHaveValue("");
  await receipt.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(enter).toBeFocused();

  await page.goto("/staff");
  await page.getByRole("region", { name: "Prepared Bills" }).getByRole("button", { name: "Enter receipt" }).click();
  await receipt.getByLabel("Method").selectOption({ label: "Cash" });
  await receipt.getByLabel("Official Receipt amount (ETB)").fill("320.50");
  await page.route("**/staff/bills", route => route.fulfill({ status: 503 }));
  await receipt.getByRole("button", { name: "Record payment" }).click();
  await expect(receipt.getByRole("alert")).toContainText("No payment was recorded");
  await expect(receipt.getByLabel("Official Receipt amount (ETB)")).toHaveValue("320.50");
  await expect(receipt.getByLabel("Method")).toHaveValue("cash");
  await page.unroute("**/staff/bills");
  let connected = false;
  await page.route("**/staff/bills?**", route => connected ? route.continue() : route.abort());
  await page.route("**/staff/bills", async route => {
    expect((await route.fetch()).status()).toBe(200);
    await route.abort();
  });
  await receipt.getByRole("button", { name: "Record payment" }).click();
  await expect(receipt.getByRole("alert")).toContainText("The payment status is unknown");
  await expect(receipt.getByLabel("Official Receipt amount (ETB)")).toHaveValue("320.50");
  await expect(receipt.getByRole("button", { name: "Record payment", exact: true })).toHaveCount(0);
  connected = true;
  await receipt.getByRole("button", { name: "Check payment status" }).click();
  const recorded = page.getByRole("status").filter({ hasText: "Payment recorded · Table 1" });
  await expect(recorded).toContainText("320.5 ETB · Cash");
  await page.unrouteAll({ behavior: "wait" });

  await page.getByRole("link", { name: "Tables", exact: true }).click();
  await page.getByLabel("Table number").fill("6");
  await expect(page.locator(".waiter-table-grid a")).toHaveCount(1);
  await page.getByRole("link", { name: /Table 6/ }).click();
  await expect(page.getByRole("link", { name: "Add a Dish" })).toBeInViewport();
  await page.getByRole("link", { name: "Back to Tables" }).click();
  await expect(page.getByLabel("Table number")).toHaveValue("6");
  await expect(page.getByRole("link", { name: /Table 6/ })).toBeFocused();

  if (info.project.name === "android-chrome") {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.getByText("Account", { exact: true }).click();
    await page.getByRole("button", { name: "አማ", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await page.addStyleTag({ content: "html { font-size: 200% }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("Manager opens service with a coverage check and goes directly to the affected Table", async ({ page }, info) => {
  const s = await scenario().venue("Lancha", { tables: 16 }).manager("Hana").waiter("Mekdes").publishedMenu().build();
  await signIn(page, s.managers.Hana);
  await page.getByRole("link", { name: "Start service", exact: true }).click();
  const start = page.getByRole("button", { name: "Start Shift", exact: true });
  await expect(start).toBeInViewport();
  await start.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("without assigning any Tables");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Start Shift", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Running Shift" })).toBeVisible();

  await sendAt(s, 1);
  const floor = page.getByRole("link", { name: "Live floor", exact: true });
  await floor.click();
  await expect(floor).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Shift open · No Waiters assigned")).toBeVisible();
  const attention = page.getByRole("region", { name: "Needs attention" });
  const row = attention.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Table 1", exact: true }) });
  const assign = row.getByRole("link", { name: "Assign Waiter", exact: true });
  await expect(assign).toBeInViewport({ ratio: 1 });
  const tableSearch = page.getByRole("searchbox", { name: "Find a table" });
  await tableSearch.fill("1");
  const result = page.getByRole("region", { name: "Matching tables" }).locator(".manager-floor-tables");
  await result.getByRole("link", { name: "Assign Waiter", exact: true }).click();
  const assignment = page.getByRole("region", { name: "Assign Table 1", exact: true });
  await assignment.getByRole("button", { name: "Mekdes", exact: true }).click();
  await expect(assignment.getByRole("status")).toBeVisible();

  await assignment.getByRole("link", { name: "Back to Live floor" }).click();
  const detail = page.getByText("Open Table 1", { exact: true });
  await expect(detail).toBeInViewport({ ratio: 1 });
  await detail.click();
  const open = page.getByRole("region", { name: "Needs attention" });
  await expect(open.getByText("“No onions”")).toBeVisible();
  await expect(page).toHaveURL(/\/floor$/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("manager-floor.png") });

  await page.route("**/floor/live", route => route.abort());
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Could not refresh the floor");
  await expect(open.getByText("“No onions”")).toBeVisible();
  await page.unroute("**/floor/live");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Could not refresh the floor")).toHaveCount(0);

  await tableSearch.fill("16");
  await expect(page.getByRole("region", { name: "Matching tables" }).getByText("Table 16", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Venue menu", exact: true }).click();
  await page.getByRole("searchbox", { name: "Find a dish" }).fill("ማኪያቶ");
  const dish = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Macchiato", exact: true }) });
  await dish.getByRole("button", { name: /Mark sold out/ }).click();
  await expect(dish.getByRole("button", { name: /Restore availability/ })).toBeVisible();
  if (info.project.name === "android-chrome") {
    await floor.click();
    await expect(page).toHaveURL(/\/floor$/);
    await page.setViewportSize({ width: 320, height: 780 });
    await page.getByText("Account", { exact: true }).click();
    await page.getByRole("button", { name: "አማ", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await page.addStyleTag({ content: "html { font-size: 200% }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("Manager reviews waiting orders and recovers a changed bill and a lost receipt response", async ({ page }, info) => {
  const s = await scenario().brand("Closing checks").venue("Lancha", { tables: 3 }).manager("Hana").waiter("Mekdes").publishedMenu().build();
  const manager = s.managers.Hana;
  const waiter = s.waiters.Mekdes;
  const venueId = s.venue.id;
  await startShift(manager.actor, { venueId, assignments: [{ tableId: s.venue.tables[0].id, waiterId: waiter.waiterId }] });
  const first = await sendAt(s, 1);
  const accept = (orderId: string) => acceptOrder(waiter.actor, { orderId, unlockToken: waiter.unlockToken });
  await accept(first.id);
  const waiting = await sendAt(s, 1, [{ name: "Omelette", quantity: 1, note: "Bring together" }]);
  expect(waiting.visitId).toBe(first.visitId);
  const target = { venueId, visitId: first.visitId };

  await signIn(page, manager);
  const closing = page.getByRole("link", { name: "Closing", exact: true });
  await closing.click();
  const review = page.getByRole("link", { name: "Review waiting order" });
  await expect(review).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare bill" })).toHaveCount(0);
  await review.click();
  await expect(page.getByRole("region", { name: "Needs attention" }).getByText("“Bring together”")).toBeVisible();
  await accept(waiting.id);
  await closing.click();
  await expect(page).toHaveURL(/\/closing$/);
  await page.reload();
  await page.getByRole("button", { name: "Prepare bill" }).click();
  await page.getByRole("button", { name: "Enter receipt" }).click();
  const sheet = page.getByRole("dialog", { name: "Enter receipt for Table 1" });
  const amount = sheet.getByLabel("Official Receipt amount (ETB)", { exact: true });
  await expect(amount).toHaveValue("");
  await sheet.getByLabel("Method", { exact: true }).selectOption({ label: "Cash" });
  await amount.fill("430");
  await expect(sheet.getByText("Receipt Difference: −10 ETB")).toBeVisible();

  await adjustVisitBill(s.owner.actor, { ...target, kind: "discount", reason: "Service recovery", amountSantim: 2_000 });
  await sheet.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("Bill changed from 440 ETB to 420 ETB");
  await expect(amount).toHaveValue("430");
  expect((await getClosingReport(manager.actor, { venueId })).payments).toHaveLength(0);
  await sheet.getByRole("button", { name: "Review updated bill" }).click();
  await expect(sheet.getByText("Receipt Difference: +10 ETB")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Record payment", exact: true })).toBeEnabled();
  expect((await getClosingReport(manager.actor, { venueId })).payments).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("manager-receipt.png") });

  let offline = true;
  await page.route("**/staff/bills*", async route => {
    if (route.request().method() === "POST") {
      expect((await route.fetch()).status()).toBe(200);
      return route.abort();
    }
    if (offline) return route.abort();
    return route.continue();
  });
  await sheet.getByRole("button", { name: "Record payment", exact: true }).click();
  const check = sheet.getByRole("button", { name: "Check payment status", exact: true });
  await expect(check).toBeVisible();
  await expect(amount).toHaveValue("430");
  offline = false;
  await check.click();
  await expect(page.getByRole("status").filter({ hasText: "Payment recorded · Table 1" })).toContainText("430 ETB");
  await expect(sheet).toHaveCount(0);
  expect((await getClosingReport(manager.actor, { venueId })).payments).toMatchObject([
    { visitId: first.visitId, billTotalSantim: 42_000, receiptAmountSantim: 43_000, differenceSantim: 1_000 },
  ]);
  await page.getByRole("link", { name: "View receipt" }).click();
  await page.getByRole("link", { name: "Differences only" }).click();
  await expect(page.getByText("1 receipt difference", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Daily Payment Confirmations" }).getByText("+10 ETB", { exact: true })).toHaveCount(2);
});

test("Owner sees independent service issues and reviews Brand publication by Venue", async ({ page }, info) => {
  const s = await scenario().brand("Juniper Café").venue("Lancha", { tables: 4 }).venue("Bole", { tables: 4 }).waiter("Mekdes").publishedMenu().build();
  await updateVenueService(s.owner.actor, { venueId: s.venues.Bole.id, hours: { opensAt: "00:00", closesAt: "23:59" }, periods: [] });
  const now = new Date();
  const earlier = new Date(now.getTime() - 30 * 60_000);
  const staff = s.waiters.Mekdes;
  const { id: venueId } = s.venue;
  await startShift(s.owner.actor, { venueId, assignments: s.venue.tables.slice(0, 3).map(table => ({
    tableId: table.id, waiterId: staff.waiterId,
  })) }, { now: earlier });
  const [prepared, paid] = [await sendAt(s, 1, undefined, earlier), await sendAt(s, 2)];
  await acceptOrder(staff.actor, { orderId: prepared.id, unlockToken: staff.unlockToken }, { now: earlier });
  await acceptOrder(staff.actor, { orderId: paid.id, unlockToken: staff.unlockToken });
  await prepareBill(s.owner.actor, { venueId, visitId: prepared.visitId }, { now: earlier });
  const target = { venueId, visitId: paid.visitId };
  const billSnapshot = await prepareBill(s.owner.actor, target);
  await confirmPayment(s.owner.actor, { ...target, billSnapshot, paymentOptionId: null, receiptAmountSantim: billSnapshot.totalSantim + 100 });
  await sendAt(s, 3);
  const setLocalPrice = async (priceSantim: number) => {
    const venueId = s.venues.Bole.id;
    const { draft } = await getVenueMenuDraft(s.owner.actor, { venueId });
    draft.menu.sections[0].dishes[0].priceSantim = priceSantim;
    await saveVenueMenu(s.owner.actor, { venueId, revision: draft.revision!, menu: draft.menu, publish: true });
  };
  await setLocalPrice(26_000);
  await signIn(page, s.owner);
  await expect(page.getByRole("heading", { name: "Juniper Café", level: 1 })).toBeVisible();
  const bole = page.getByRole("region", { name: "Your venues" }).getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Bole", exact: true }) });
  await expect(bole).toContainText("Scheduled open");
  await expect(bole).toContainText("No running Shift");
  await expect(page.getByText("1 of 2 Venues in service")).toBeVisible();
  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention.getByRole("link", { name: "Lancha · 1 table with waiting orders" })).toBeVisible();
  await expect(attention.getByRole("link", { name: "Lancha · 1 overdue receipt" })).toBeVisible();
  await expect(attention.getByRole("link", { name: "Lancha · 1 receipt difference" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("owner-overview.png") });
  await attention.getByRole("link", { name: "Lancha · 1 table with waiting orders" }).click();
  await expect(page.getByRole("button", { name: /^Orders/ })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();

  await page.getByRole("link", { name: "Open Brand Menu" }).click();
  const edit = page.getByRole("region", { name: "Edit", exact: true });
  await edit.getByText("Omelette", { exact: true }).click();
  await edit.getByRole("spinbutton", { name: "Base price (ETB)", exact: true }).fill("245");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved · Guests still see the published Menu")).toBeVisible();
  await page.getByRole("button", { name: "Review and publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish Brand Menu?" });
  await expect(dialog).toContainText("Juniper Café");
  await expect(dialog.getByRole("region", { name: "Lancha" })).toContainText(/220.*245/);
  await expect(dialog.getByRole("region", { name: "Bole" })).toContainText("keeps its local price of 260 ETB");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await setLocalPrice(27_000);
  await dialog.getByRole("button", { name: "Publish Brand Menu" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Venue Menu effects changed");
  await page.getByRole("button", { name: "Review and publish", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Bole" })).toContainText("keeps its local price of 270 ETB");
  await page.screenshot({ path: info.outputPath("owner-publish-review.png") });
  await dialog.getByRole("button", { name: "Publish Brand Menu" }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
  for (const [venue, price] of [[s.venue, 24_500], [s.venues.Bole, 27_000]] as const) {
    const guest = await getPublishedMenu(publicActor, { venueLinkToken: venue.linkToken });
    expect(guest?.sections.flatMap(section => section.dishes).find(dish => dish.name === "Omelette")?.priceSantim).toBe(price);
  }
});

test("Owner navigation follows the URL across Brand bookmarks, switches and venue returns", async ({ page }) => {
  const bilos = await scenario().brand("Bilo's Pastry").venue("Lancha").publishedMenu().build();
  const second = await scenario().brand("Zuri Café").venue("Piassa").publishedMenu().build();
  await addBrandOwner(systemActor, { brandId: second.brand.id, userId: bilos.owner.userId });
  const zuri = `/manage/brands/${second.brand.id}`;
  const first = `/manage/brands/${bilos.brand.id}`;
  await signIn(page, bilos.owner);
  await expect(page).toHaveURL(first);
  await page.goto(`/manage?brand=${second.brand.id}`);
  await expect(page).toHaveURL(zuri);
  await page.getByRole("link", { name: "Brand menu", exact: true }).click();
  await expect(page).toHaveURL(zuri + "/menu");
  await expect(page.getByRole("heading", { name: "Menu for Zuri Café" })).toBeVisible();
  await page.locator(".manager-identity-trigger").click();
  await page.getByRole("button", { name: "Bilo's Pastry", exact: true }).click();
  await expect(page).toHaveURL(first + "/menu");
  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(zuri + "/menu");
  await expect(page.locator(".manager-identity-trigger")).toContainText("Zuri Café");
  await page.goto(`/manage/venues/${second.venue.id}/floor`);
  await page.locator(".manager-identity-trigger").click();
  await page.getByRole("link", { name: "Owner overview", exact: true }).click();
  await expect(page).toHaveURL(zuri);
  await page.goto(`/manage?brand=${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "We couldn't find what you were looking for." })).toBeVisible();
});
