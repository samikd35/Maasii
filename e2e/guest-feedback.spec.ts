import { expect, test } from "@playwright/test";
import { acceptOrder, confirmPayment, getMyTableOrders, prepareBill, startShift } from "@/core";
import { scenario } from "../tests/support/scenario";

test("the private Reviews page reuses the paid Visit and keeps feedback on failure", async ({ page, browser, baseURL }) => {
  const s = await scenario().waiter("Sam").publishedMenu().build();
  const sam = s.waiters.Sam;
  const venueId = s.venue.id;
  const tableId = s.venue.tables[0].id;
  const url = `/v/${s.venue.linkToken}`;
  const feedback = `${url}/feedback`;
  await startShift(s.owner.actor, { venueId, assignments: [{ tableId, waiterId: sam.waiterId }] });

  await page.goto(feedback);
  await expect(page.getByRole("heading", { name: "Private feedback", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("No paid visit is linked to this phone.", { exact: false })).toBeVisible();
  expect((await page.context().cookies()).some(({ name }) => name.startsWith("mx_guest_session"))).toBe(false);

  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Choose Omelette", exact: true }).click();
  await page.getByRole("button", { name: "Add to order" }).click();
  await page.getByRole("button", { name: /Your Draft/ }).click();
  await page.getByRole("button", { name: "Choose your table", exact: true }).click();
  await page.getByRole("button", { name: "Table 1", exact: true }).click();
  await page.getByRole("button", { name: "Send to Table 1", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Sent", { exact: true })).toBeVisible();

  await page.goto(feedback);
  await expect(page.getByText("You can leave a review once your waiter records payment for this visit.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit review" })).toHaveCount(0);

  const { orders: [order] } = await getMyTableOrders(sam.actor, { unlockToken: sam.unlockToken });
  await acceptOrder(sam.actor, { orderId: order.id, unlockToken: sam.unlockToken });
  const target = { venueId, visitId: order.visitId, unlockToken: sam.unlockToken };
  await prepareBill(sam.actor, target);
  await confirmPayment(sam.actor, { ...target, paymentOptionId: null, receiptAmountSantim: 22_000 });

  const outsider = await browser.newPage({ ...test.info().project.use, baseURL });
  try {
    await outsider.goto(feedback);
    await expect(outsider.getByText("No paid visit is linked to this phone.", { exact: false })).toBeVisible();
    await expect(outsider.getByRole("button", { name: "Submit review" })).toHaveCount(0);
  } finally {
    await outsider.close();
  }

  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: /Your table.*Table 1/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("link", { name: "Open Reviews page" }).click();
  await expect(page).toHaveURL(feedback);
  const review = page.locator("form").filter({ has: page.getByRole("group", { name: "How was your visit?" }) });
  await expect(review.getByText("Shared privately with Test Brand")).toBeVisible();
  await review.getByRole("radio", { name: "Great" }).check();
  await review.getByLabel("Comment (optional)").fill("Great breakfast.");
  await page.route(`${url}/reviews`, (route) => route.abort(), { times: 1 });
  await review.getByRole("button", { name: "Submit review" }).click();
  await expect(review.getByRole("alert")).toHaveText("Could not send the review. Try again.");
  await expect(review.getByRole("radio", { name: "Great" })).toBeChecked();
  await expect(review.getByLabel("Comment (optional)")).toHaveValue("Great breakfast.");
  await review.getByRole("button", { name: "Submit review" }).click();
  const saved = "Review sent. How was your visit?";
  await expect(page.getByText(saved)).toBeVisible();
  await page.reload();
  await expect(page.getByText(saved)).toBeVisible();
  await expect(review).toHaveCount(0);
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: /Your table.*Table 1/ }).click();
  await expect(sheet.getByText(saved)).toBeVisible();
});
