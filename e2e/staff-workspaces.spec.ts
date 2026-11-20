import { uniquePhone } from "../tests/support/users";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createWaiterJoinCode, guestActor, sendOrder, startShift, updateVenueService } from "@/core";
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

async function sendAt(s: Scenario, number: number, dishes = [{ name: "Omelette", quantity: 1, note: "No onions" }]) {
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Could not start the guest session");
  return sendOrder(guestActor(data.user.id), {
    venueLinkToken: s.venue.linkToken, tableId: s.venue.tables[number - 1].id, requestId: randomUUID(),
    lines: dishes.map(({ name, quantity, note }) => ({ dishId: s.dishId(name), quantity, note, choiceIds: [] })),
  });
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
  await expect(page).toHaveURL(/\/manage$/);
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

  const floor = page.getByRole("link", { name: "Live floor", exact: true });
  await floor.click();
  await expect(floor).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Shift open · No Waiters assigned")).toBeVisible();
  await page.getByRole("link", { name: "Assign uncovered Tables" }).click();
  const waiterSelect = page.getByRole("combobox", { name: "Table 1", exact: true });
  const assignment = page.getByRole("listitem").filter({ has: waiterSelect });
  await waiterSelect.selectOption({ label: "Mekdes" });
  await assignment.getByRole("button", { name: "Save assignment" }).click();
  await expect(assignment.getByRole("status")).toBeVisible();

  await sendAt(s, 1);
  await floor.click();
  await page.getByRole("link", { name: "Open Table 1", exact: true }).click();
  const open = page.getByRole("region", { name: "Open Tables" });
  await expect(open.getByText("“No onions”")).toBeVisible();
  await expect(page).toHaveURL(/\/floor#floor-visit-/);
  await page.screenshot({ path: info.outputPath("manager-floor.png") });

  await page.route("**/floor/live", route => route.abort());
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Could not refresh the floor");
  await expect(open.getByText("“No onions”")).toBeVisible();
  await page.unroute("**/floor/live");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Could not refresh the floor")).toHaveCount(0);

  await page.getByRole("link", { name: "Venue menu", exact: true }).click();
  await page.getByRole("searchbox", { name: "Find a dish" }).fill("Macchiato");
  await page.getByRole("button", { name: "Show dishes", exact: true }).click();
  const dish = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Macchiato", exact: true }) });
  await dish.getByRole("button", { name: /Mark sold out/ }).click();
  await expect(dish.getByRole("button", { name: /Restore availability/ })).toBeVisible();
});

test("Owner distinguishes scheduled hours from active service and confirms Brand publication", async ({ page }, info) => {
  const s = await scenario().brand("Juniper Café").venue("Lancha", { tables: 4 }).venue("Bole", { tables: 4 }).waiter("Mekdes").publishedMenu().build();
  await updateVenueService(s.owner.actor, { venueId: s.venues.Bole.id, hours: { opensAt: "00:00", closesAt: "23:59" }, periods: [] });
  await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [{ tableId: s.venue.tables[0].id, waiterId: s.waiters.Mekdes.waiterId }] });
  await signIn(page, s.owner);
  await expect(page.getByRole("heading", { name: "Juniper Café", level: 1 })).toBeVisible();
  const bole = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Bole", exact: true }) });
  await expect(bole).toContainText("Scheduled open");
  await expect(bole).toContainText("No running Shift");
  await expect(page.getByText("1 of 2 Venues in service")).toBeVisible();
  await page.screenshot({ path: info.outputPath("owner-overview.png") });

  await page.getByRole("link", { name: "Open Brand Menu" }).click();
  const edit = page.getByRole("region", { name: "Edit", exact: true });
  await edit.getByText("Omelette", { exact: true }).click();
  await edit.getByRole("spinbutton", { name: "Base price (ETB)", exact: true }).fill("245");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved · Guests still see the published Menu")).toBeVisible();
  await page.getByRole("button", { name: "Review and publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish Brand Menu?" });
  await expect(dialog).toContainText("Juniper Café");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Publish Brand Menu" }).click();
  await expect(page.getByText("Menu published.", { exact: true })).toBeVisible();
});
