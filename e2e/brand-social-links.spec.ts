import { expect, test } from "@playwright/test";
import { scenario } from "../tests/support/scenario";

test("an Owner saves ordered social links once for both Venues", async ({ page, browser, baseURL }) => {
  const s = await scenario().brand("Bole Coffee").venue("Lancha").venue("Bole").manager("Hana").build();
  const branding = `/manage/brands/${s.brand.id}/branding`;
  const guest = await browser.newPage({ ...test.info().project.use, baseURL });
  try {
    await guest.goto(`/v/${s.venue.linkToken}/social`);
    await expect(guest.getByRole("heading", { name: "Social media", level: 1 })).toBeVisible();
    await expect(guest.getByText("This brand has not added any social media links yet.")).toBeVisible();
    expect((await guest.context().cookies()).some(({ name }) => name.startsWith("mx_guest_session"))).toBe(false);

    await page.goto("/sign-in");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.getByLabel("Email or phone").fill(s.owner.email);
    await page.getByLabel("Password").fill(s.owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/sign-in$/);
    await page.goto(branding);
    const form = page.getByRole("form", { name: "Social media links" });
    await form.getByRole("button", { name: "Add social link" }).click();
    const first = form.getByRole("group", { name: "Link 1" });
    await first.getByLabel("Link name").fill("Instagram");
    const url = first.getByLabel("Profile URL");
    await url.fill("http://www.instagram.com/testcafe/");
    await form.getByRole("button", { name: "Save social links" }).click();
    await expect(form.getByRole("alert")).toContainText("public HTTPS profile address");
    await expect(url).toHaveValue("http://www.instagram.com/testcafe/");
    await url.fill("https://www.instagram.com/testcafe/");

    await form.getByRole("button", { name: "Add social link" }).click();
    const second = form.getByRole("group", { name: "Link 2" });
    await second.getByLabel("Link name").fill("Telegram");
    await second.getByLabel("Profile URL").fill("https://t.me/testcafe");
    await second.getByRole("button", { name: "Move link 2 up" }).click();
    await page.route(branding, (route) => route.abort(), { times: 1 });
    await form.getByRole("button", { name: "Save social links" }).click();
    await expect(form.getByRole("alert")).toContainText("Your edits are still here");
    await expect(first.getByLabel("Link name")).toHaveValue("Telegram");
    await expect(second.getByLabel("Profile URL")).toHaveValue("https://www.instagram.com/testcafe/");
    await form.getByRole("button", { name: "Save social links" }).click();
    await expect(form.getByRole("status")).toHaveText("Social media links saved for every venue.");

    for (const venue of Object.values(s.venues)) {
      await guest.goto(`/v/${venue.linkToken}/social`);
      const list = guest.getByRole("list").filter({ has: guest.getByRole("link", { name: "Instagram", exact: true }) });
      await expect(list.getByRole("link")).toHaveText(["Telegram", "Instagram"]);
      await expect(list.getByRole("link", { name: "Telegram" })).toHaveAttribute("href", "https://t.me/testcafe");
    }

    await first.getByRole("button", { name: "Remove link 1" }).click();
    await form.getByRole("button", { name: "Save social links" }).click();
    await expect.poll(async () => {
      await guest.reload();
      return guest.getByRole("link", { name: "Telegram" }).count();
    }).toBe(0);
    await expect(guest.getByRole("link", { name: "Instagram" })).toBeVisible();
  } finally {
    await guest.close();
  }
});
