import { test } from "@playwright/test";
test("debug", async ({ page }) => {
  page.on("console", (m) => console.log("console0", m.type(), m.text()));
  await page.goto("/v/bilos-lancha", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, 2058));
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => ({ y: scrollY, url: location.href, top: document.querySelector("h2:nth-of-type(1)") && [...document.querySelectorAll("h2")].map(h => [h.textContent, Math.round(h.getBoundingClientRect().top)]) }));
  console.log("before", JSON.stringify(before));
  await page.evaluate(() => { (window as any).__main = document.querySelector("main"); (window as any).__body = document.body; (window as any).__h3 = document.querySelector("h3");
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if ((n as Element).tagName) console.log("removed", (n as Element).tagName, (m.target as Element).tagName); }).observe(document, { childList: true, subtree: true });
    addEventListener("scroll", () => console.log("scroll", scrollY, document.documentElement.scrollHeight)); });
  page.on("request", (r) => console.log("req", r.method(), r.resourceType(), r.url(), JSON.stringify(r.headers()["next-action"] ?? "")));
  page.on("console", (m) => console.log("console", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.getByRole("button", { name: "አማ" }).click();
  await page.getByRole("heading", { level: 1, name: "ምናሌያችን" }).waitFor();
  for (const t of [0, 300, 1500]) {
    await page.waitForTimeout(t);
    const after = await page.evaluate(() => ({ y: scrollY, url: location.href, h: document.documentElement.scrollHeight, top: [...document.querySelectorAll("h2")].map(h => [h.textContent, Math.round(h.getBoundingClientRect().top)]) }));
    console.log("after", t, JSON.stringify(after), await page.evaluate(() => [(window as any).__main === document.querySelector("main"), (window as any).__body === document.body, (window as any).__h3 === document.querySelector("h3")]));
  }
});
