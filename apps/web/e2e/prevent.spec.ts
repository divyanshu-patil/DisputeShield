import { expect, test } from "@playwright/test";

test("risk radar: scan, add tracking as a dry run, refund needs the typed amount (AC-RISK-01, 04, 05)", async ({
  page,
}) => {
  await page.goto("/risk");
  await page.getByRole("button", { name: "Scan now" }).click();
  await expect(page.getByText(/new flag|no new gaps/)).toBeVisible();
  const grid = page.locator("main .ag-root-wrapper");
  await expect(grid.locator(".ag-row").first()).toBeVisible();

  await grid.getByText("9GS37756XK118843E").click();
  await page.getByRole("button", { name: "Add tracking" }).click();
  const track = page.getByRole("dialog", {
    name: "Add tracking to the PayPal order",
  });
  await track.getByLabel("Tracking number").fill("9400111899223197428490");
  await track.getByRole("button", { name: "Store (dry run)" }).click();
  await expect(
    page.getByText("Stored as a dry run; PayPal was not changed."),
  ).toBeVisible();
  await expect(grid.getByText("9GS37756XK118843E")).toBeHidden();

  await grid.getByText("Address mismatch").click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const refund = page.getByRole("dialog", { name: "Refund $158.00" });
  const confirm = refund.getByRole("button", { name: "Store (dry run)" });
  await expect(confirm).toBeDisabled();
  await refund.getByLabel("Type $158.00 to confirm").fill("$158.00");
  await expect(confirm).toBeEnabled();
  await refund.getByRole("button", { name: "Cancel" }).click();
});
