import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getLiveFloor, guestActor, sendOrder, startShift } from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../tests/support/scenario";

test("the Manager's floor refreshes live and switches from a phone list to a room grid", async ({ page }) => {
  const s = await scenario().venue("Lancha", { tables: 3 }).manager("Hana").waiter("Sam").publishedMenu().build();
  const manager = s.managers.Hana;
  const { id: venueId, tables, linkToken } = s.venue;
  const now = Date.now();
  await startShift(manager.actor, { venueId, assignments: tables.slice(0, 2).map((table) => ({
    tableId: table.id, waiterId: s.waiters.Sam.waiterId,
  })) }, { now: new Date(now - 240_000) });
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(manager.email);
  await page.getByLabel("Password").fill(manager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Lancha" }).click();
  await page.getByRole("link", { name: "Live floor" }).click();
  await expect(page.getByText("No open Tables.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Assign Waiter" })).toHaveAttribute("href", new RegExp(tables[2].id));

  for (const table of tables.slice(0, 2)) {
    const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
    if (error) throw error;
    await sendOrder(guestActor(data.user!.id), {
      venueLinkToken: linkToken, tableId: table.id, requestId: randomUUID(),
      lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
    }, { now: new Date(now - 180_000) });
  }
  expect((await getLiveFloor(manager.actor, { venueId })).tables).toHaveLength(2);
  const tiles = page.getByRole("region", { name: "Open Tables" }).getByRole("listitem");
  await expect(tiles).toHaveCount(2, { timeout: 12_000 });
  await expect(tiles.nth(0).getByText("Order waiting", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Exceptions" }).getByText(/Order waiting for acceptance/)).toHaveCount(2);
  const list = page.getByRole("region", { name: "Open Tables" }).getByRole("list");
  await expect(list).toHaveCSS("display", "flex");
  await expect(list).toHaveCSS("flex-direction", "column");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(list).toHaveCSS("display", "grid");
  await expect.poll(async () => (await tiles.nth(0).boundingBox())?.y).toBe((await tiles.nth(1).boundingBox())?.y);
});
