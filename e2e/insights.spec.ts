import { randomUUID } from "node:crypto";
import { acceptOrder, guestActor, sendOrder, startShift, updateVenueService } from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";

import { expect, test } from "@playwright/test";
import { scenario } from "../tests/support/scenario";

test("an Owner can set Service Periods and select a reporting week", async ({ page }) => {
  const s = await scenario().venue("Lancha").publishedMenu().build();
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(s.owner.email);
  await page.getByLabel("Password").fill(s.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Lancha" }).click();
  await page.getByRole("link", { name: "Dish insights" }).click();
  await page.getByText("Service hours and periods", { exact: true }).click();
  await page.locator('input[name="opensAt"]').fill("07:00");
  await page.locator('input[name="closesAt"]').fill("22:00");
  await page.getByLabel("Period name").fill("Breakfast");
  await page.locator('input[name="startsAt"]').fill("07:00");
  await page.locator('input[name="endsAt"]').fill("11:00");
  await page.getByRole("button", { name: "Save service hours and periods" }).click();
  await expect(page.getByRole("group", { name: "Breakfast", exact: true })).toBeVisible();
  await page.locator('input[name="week"]').fill("2026-11-08");
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(page.getByText(/2026-11-02.*2026-10-26/)).toBeVisible();
});

test("an Owner sees the Weekly Finding with its Orders and sees the Live floor during service", async ({ page }) => {
  const s = await scenario().venue("Lancha", { tables: 1 }).waiter("Sam").publishedMenu().build();
  const { id: venueId, tables: [table], linkToken } = s.venue;
  await updateVenueService(s.owner.actor, { venueId, hours: { opensAt: "07:00", closesAt: "22:00" },
    periods: [{ name: "Lunch", startsAt: "11:00", endsAt: "15:00" }] });
  const waiter = s.waiters.Sam;
  const early = new Date("2026-10-26T09:00:00Z");
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId: table.id, waiterId: waiter.waiterId }] }, { now: early });
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error) throw error;
  for (const [quantity, now] of [[12, early], [2, new Date("2026-11-02T09:00:00Z")]] as const) {
    const order = await sendOrder(guestActor(data.user!.id), { venueLinkToken: linkToken, tableId: table.id,
      requestId: randomUUID(), lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity, note: "" }] }, { now });
    await acceptOrder(waiter.actor, { orderId: order.id, unlockToken: waiter.unlockToken }, { now });
  }

  await page.context().setExtraHTTPHeaders({ "x-maasii-test-now": "2026-11-11T20:00:00Z" });
  await page.goto("/sign-in");
  const english = page.getByRole("button", { name: "EN", exact: true });
  if (await english.getAttribute("aria-pressed") === "false") await english.click();
  await page.getByLabel("Email or phone").fill(s.owner.email);
  await page.getByLabel("Password").fill(s.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const finding = page.getByRole("region", { name: "Weekly Finding", exact: true });
  await expect(finding.getByText("Omelette at Lunch: 2 accepted, down from 12 the week before.")).toBeVisible();
  await finding.getByRole("link", { name: "View evidence" }).click();
  const evidence = page.getByRole("region", { name: "Weekly Finding evidence" });
  await expect(evidence.getByRole("listitem")).toHaveCount(2);
  await expect(evidence.getByText(/12 accepted/)).toBeVisible();
  await expect(evidence.getByText(/· 2 accepted/)).toBeVisible();

  await page.context().setExtraHTTPHeaders({ "x-maasii-test-now": "2026-11-11T09:00:00Z" });
  await page.goto("/manage");
  await expect(page.getByRole("region", { name: "Live floor" }).getByRole("link", { name: "Table 1" })).toBeVisible();
  await expect(finding).toHaveCount(0);
});
