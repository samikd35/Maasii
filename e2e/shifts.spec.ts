import { expect, test } from "@playwright/test";
import { scenario } from "../tests/support/scenario";

test("a Manager starts from Usual Tables, moves an assignment and ends the Shift on a phone", async ({ page }) => {
  const s = await scenario().brand("Shift coverage").venue("Lancha", { tables: 3 }).manager("Aster").waiter("Sam").waiter("Hana").build();
  const manager = s.managers.Aster;
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Email or phone").fill(manager.email);
  await page.getByLabel("Password").fill(manager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Shifts" }).click();

  const usual = page.getByRole("region", { name: "Usual Tables" });
  await usual.getByText("Sam", { exact: true }).click();
  await usual.getByRole("checkbox", { name: "Table 1" }).check();
  await usual.getByRole("checkbox", { name: "Table 2" }).check();
  await usual.getByRole("button", { name: "Save Usual Tables" }).click();

  const suggested = page.getByRole("region", { name: "Suggested Table Assignments" });
  await suggested.getByText("Review assignments", { exact: true }).click();
  await expect(suggested.getByLabel("Table 1")).toHaveValue(s.waiters.Sam.waiterId);
  await expect(suggested.getByLabel("Table 2")).toHaveValue(s.waiters.Sam.waiterId);
  await suggested.getByLabel("Table 2").selectOption({ label: "Hana" });
  await page.setExtraHTTPHeaders({ "x-maasii-test-now": "2026-11-11T15:05:00.000Z" });
  await suggested.getByRole("button", { name: "Start Shift" }).click();

  const running = page.getByRole("region", { name: "Running Shift" });
  await expect(running.getByText(/18:05 \(Addis Ababa\)/)).toBeVisible();
  const unassigned = running.getByRole("region", { name: "Unassigned Tables" });
  await expect(unassigned.getByText("Table 3", { exact: true })).toBeVisible();
  await running.getByRole("link", { name: "Assign Table 1", exact: true }).click();
  const picker = running.getByRole("region", { name: "Assign Table 1" });
  await expect(picker.getByRole("button", { name: "Sam" })).toBeDisabled();
  await picker.getByRole("button", { name: "Hana" }).click();
  await expect(picker.getByRole("status")).toHaveText("Table Assignment saved.");
  await expect(picker.getByRole("button", { name: "Hana" })).toBeDisabled();

  await running.getByText("Shift actions", { exact: true }).click();
  await running.getByRole("button", { name: "End Shift" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End Shift" }).click();
  await suggested.getByText("Review assignments", { exact: true }).click();
  await expect(suggested.getByLabel("Table 1")).toHaveValue(s.waiters.Sam.waiterId);
  await expect(suggested.getByLabel("Table 2")).toHaveValue(s.waiters.Sam.waiterId);
  await page.getByText("Account", { exact: true }).click();
  await page.getByRole("button", { name: "አማ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "የተጠቆሙ የጠረጴዛ ምደባዎች" })).toBeVisible();
});
