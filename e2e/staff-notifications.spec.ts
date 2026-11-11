import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createWaiterJoinCode, getShiftSetup, guestActor, sendOrder, startShift } from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../tests/support/scenario";

test("staff installs a scoped worker, hears and sees an incoming Order, and opens its Table from a notification", async ({
  page, browser, baseURL,
}) => {
  test.setTimeout(45_000);
  const s = await scenario().venue("Lancha", { tables: 2 }).publishedMenu().build();
  const { url } = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl: baseURL! });
  const staff = await browser.newContext({ ...test.info().project.use, baseURL, permissions: ["notifications"] });
  try {
    const fixture = {
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      keys: { p256dh: createECDH("prime256v1").generateKeys("base64url"), auth: randomBytes(16).toString("base64url") },
    };
    await staff.addInitScript((subscription) => {
      const mockPush = {
        toJSON: () => subscription,
        unsubscribe: async () => { sessionStorage.removeItem("pushFixture"); },
      };
      Object.defineProperty(PushManager.prototype, "getSubscription", {
        value: async () => sessionStorage.getItem("pushFixture") ? mockPush : null,
      });
      Object.defineProperty(PushManager.prototype, "subscribe", {
        value: async () => {
          sessionStorage.setItem("pushFixture", "1");
          return mockPush;
        },
      });
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) {
        document.body.dataset.orderChime = "played";
        return start.apply(this, args);
      };
    }, fixture);

    const waiter = await staff.newPage();
    await waiter.goto(url);
    await waiter.getByRole("button", { name: "EN", exact: true }).click();
    await waiter.getByLabel("Name").fill("Sam");
    await waiter.getByLabel("Choose a 4-digit PIN").fill("0427");
    await waiter.getByRole("button", { name: "Join venue" }).click();
    await waiter.waitForURL("**/staff");
    await expect(waiter.locator('link[rel="manifest"]')).toHaveAttribute("href", "/staff/manifest.webmanifest");
    const manifest = await waiter.request.get("/staff/manifest.webmanifest");
    expect(await manifest.json()).toMatchObject({ display: "standalone", start_url: "/staff", scope: "/staff" });
    await expect.poll(() => waiter.evaluate(async () => (await navigator.serviceWorker.getRegistrations())
      .map(({ active }) => active?.scriptURL))).toContain(`${baseURL}/staff-sw.js`);

    await waiter.getByRole("button", { name: "Enable notifications" }).click();
    await expect(waiter.getByText("Notifications enabled on this device.")).toBeVisible();
    await waiter.reload();
    await expect.poll(() => waiter.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${baseURL}/staff-sw.js`);
    await expect(waiter.getByText("Notifications enabled on this device.")).toBeVisible();

    await page.goto(`/v/${s.venue.linkToken}`);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    // A Venue Link remains outside the worker's scope even on the same phone.
    const venue = await staff.newPage();
    await venue.goto(`/v/${s.venue.linkToken}`);
    expect(await venue.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await venue.close();
    await waiter.bringToFront();

    const setup = await getShiftSetup(s.owner.actor, { venueId: s.venue.id });
    const [one, two] = s.venue.tables;
    await startShift(s.owner.actor, { venueId: s.venue.id, assignments: [
      { tableId: one.id, waiterId: setup.waiters[0].id }, { tableId: two.id, waiterId: setup.waiters[0].id },
    ] });
    const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
    if (error) throw error;
    const guest = guestActor(data.user!.id);
    const send = (tableId: string) => sendOrder(guest, {
      venueLinkToken: s.venue.linkToken, tableId, requestId: randomUUID(),
      lines: [{ dishId: s.dishId("Omelette"), choiceIds: [], quantity: 1, note: "" }],
    });
    await waiter.getByRole("heading", { name: "My tables" }).click();
    const order = await send(one.id);
    const incoming = waiter.getByText("New Order", { exact: true });
    await expect(incoming).toBeVisible({ timeout: 12_000 });
    await expect(incoming.locator("..")).toHaveCSS("background-color", "rgb(243, 236, 224)");
    await expect(waiter.locator("body")).toHaveAttribute("data-order-chime", "played");
    const path = `/staff/tables/${order.tableId}`;
    const worker = staff.serviceWorkers()[0];
    // Chromium's headless push provider is replaced at the service worker event boundary.
    const notice = await worker.evaluate(async (payload) => {
      const sw = globalThis as unknown as { registration: ServiceWorkerRegistration; dispatchEvent(event: Event): boolean };
      const shown: { title: string; options?: NotificationOptions }[] = [];
      const show = sw.registration.showNotification;
      sw.registration.showNotification = async (title, options) => { shown.push({ title, options }); };

      function dispatch(name: string, fields: object) {
        let work: Promise<unknown> | undefined;
        sw.dispatchEvent(Object.assign(new Event(name), fields, {
          waitUntil: (promise: Promise<unknown>) => { work = promise; },
        }));
        return work;
      }

      try {
        await dispatch("push", { data: { json: () => payload } });
        const [notification] = shown;
        if (!notification) throw new Error("The worker did not show the notification");
        let dismissed = false;
        await dispatch("notificationclick", {
          notification: { data: notification.options?.data, close: () => { dismissed = true; } },
        });
        return { title: notification.title, data: notification.options?.data, dismissed };
      } finally {
        sw.registration.showNotification = show;
      }
    }, { title: "Table 1", body: "New Order", tag: order.id, url: path });
    expect(notice).toEqual({ title: "Table 1", data: { url: path }, dismissed: true });
    await expect(waiter).toHaveURL(path);
    const detail = waiter.getByRole("heading", { name: "Table 1" });
    await expect(detail).toBeVisible();
    await expect(incoming).toHaveCount(1);
    await detail.click();
    await waiter.locator("body").evaluate((body) => { delete body.dataset.orderChime; });
    await send(two.id);
    await expect(waiter.locator("body")).toHaveAttribute("data-order-chime", "played", { timeout: 12_000 });
    await expect(incoming).toHaveCount(1);
    await waiter.getByRole("link", { name: "Maasii Waiter" }).click();
    await waiter.getByRole("button", { name: "Lock", exact: true }).click();
    await waiter.goto(path);
    await waiter.getByLabel("PIN", { exact: true }).fill("0427");
    await waiter.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(waiter).toHaveURL(path);
    await expect(waiter.getByRole("heading", { name: "Table 1" })).toBeVisible();
    await waiter.getByRole("button", { name: "Sign out" }).click();
    await expect(waiter).toHaveURL("/sign-in");
  } finally {
    await staff.close();
  }
});
