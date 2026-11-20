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
  await expect(page).toHaveURL(`/manage/brands/${s.brand.id}`);
  await page.goto(`/manage/venues/${s.venue.id}`);
  await expect(page.getByRole("heading", { name: "Venue setup", level: 1 })).toBeVisible();
  await page.getByText("Service hours and periods", { exact: true }).click();
  await page.locator('input[name="opensAt"]').fill("07:00");
  await page.locator('input[name="closesAt"]').fill("22:00");
  await page.getByLabel("Period name").fill("Breakfast");
  await page.locator('input[name="startsAt"]').fill("07:00");
  await page.locator('input[name="endsAt"]').fill("11:00");
  await page.getByRole("button", { name: "Save service hours and periods" }).click();
  await expect(page.locator("#service-hours").getByRole("status")).toHaveText("Service hours and periods saved.");
  await expect(page.getByRole("group", { name: "Breakfast", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Dish insights" }).click();
  await page.getByText("Choose week", { exact: true }).click();
  await page.getByLabel("Week containing").fill("2026-11-08");
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(page).toHaveURL(/week=2026-11-08/);
  await expect(page.getByText(/Nov 2.*8, 2026/)).toBeVisible();
  await expect(page.getByText(/Compared with Oct 26.*Nov 1/)).toBeVisible();
  await page.getByRole("link", { name: "Service hours and periods" }).click();
  await expect(page.getByLabel("Period name").first()).toBeVisible();
});

test("an Owner sees the Weekly Finding with its Orders and sees the Live floor during service", async ({ page }) => {
  const s = await scenario().venue("Lancha", { tables: 1 }).venue("Bole").waiter("Sam").publishedMenu().build();
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
  await expect(page.getByRole("link", { name: "Insights", exact: true })).toHaveAttribute("aria-current", "location");
  const evidence = page.getByRole("region", { name: "Weekly Finding evidence" });
  await expect(evidence.getByRole("listitem")).toHaveCount(2);
  await expect(evidence.getByText(/12 accepted/)).toBeVisible();
  await expect(evidence.getByText(/· 2 accepted/)).toBeVisible();
  await page.getByRole("link", { name: "Dishes", exact: true }).click();
  const comparison = page.getByRole("table", { name: "Accepted quantities" });
  await expect(comparison).toHaveCount(1);
  const omelette = comparison.getByRole("row").filter({ hasText: "Omelette" });
  await expect(omelette.getByRole("cell")).toHaveText(["2", "12"]);
  await omelette.getByRole("link", { name: "Omelette", exact: true }).click();
  const detail = page.getByRole("region", { name: "Omelette", exact: true });
  await expect(detail.getByRole("row").filter({ hasText: "Lunch" }).getByRole("cell")).toHaveText(["2", "12"]);
  await page.getByRole("link", { name: "Visit Reviews", exact: true }).click();
  await expect(page.getByRole("link", { name: "Visit Reviews", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("table")).toHaveCount(0);

  await page.context().setExtraHTTPHeaders({ "x-maasii-test-now": "2026-11-11T09:00:00Z" });
  await page.goto("/manage");
  await expect(finding).toBeVisible();
  await expect(page.getByText("1 of 2 Venues in service")).toBeVisible();
  await page.getByRole("link", { name: "Open operations for Lancha" }).click();
  await expect(page.locator("[data-live-floor]").getByText("Table 1", { exact: true })).toBeVisible();
  await expect(finding).toHaveCount(0);
});
