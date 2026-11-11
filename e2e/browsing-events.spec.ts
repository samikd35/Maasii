import { expect, test, type Request } from "@playwright/test";
import { scenario } from "../tests/support/scenario";

test("browsing uses one anonymous identifier through a locale refresh and a new one on reload", async ({ page }) => {
  const s = await scenario().publishedMenu().build();
  const link = `/v/${s.venue.linkToken}`;
  const endpoint = `${link}/browsing-events`;
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === endpoint && request.method() === "POST") requests.push(request);
  });

  await page.goto(link);
  await expect.poll(() => requests.length).toBe(1);
  const { pageLoadId } = requests[0].postDataJSON();
  expect(pageLoadId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  await page.getByRole("button", { name: "Omelette" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Omelette");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "አማ" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await page.getByRole("button", { name: "ኦምሌት" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("ኦምሌት");

  await expect.poll(() => requests.map((request) => request.postDataJSON())).toEqual([
    { kind: "menu_opened", pageLoadId },
    { kind: "dish_opened", pageLoadId, dishId: s.dishId("Omelette") },
    { kind: "dish_opened", pageLoadId, dishId: s.dishId("Omelette") },
  ]);
  expect((await requests[2].allHeaders()).cookie).toBeUndefined();
  const stored = await page.evaluate(() => [document.cookie, { ...localStorage }, { ...sessionStorage }]);
  expect(JSON.stringify(stored)).not.toContain(pageLoadId);

  await page.reload();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].postDataJSON()).toEqual({ kind: "menu_opened", pageLoadId: expect.any(String) });
  expect(requests[3].postDataJSON().pageLoadId).not.toBe(pageLoadId);

  await page.route(endpoint, (route) => route.abort());
  const failed = page.waitForEvent("requestfailed", { predicate: (request) => new URL(request.url()).pathname === endpoint });
  await page.getByRole("button", { name: "ኦምሌት" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("ኦምሌት");
  await failed;
});
