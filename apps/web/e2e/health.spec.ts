import { expect, test } from "@playwright/test";

test("health dashboard renders its widgets from the analytics views (AC-UI-09)", async ({
  page,
}) => {
  await page.goto("/health");
  await expect(
    page.getByRole("heading", { name: "Dispute health" }),
  ).toBeVisible();
  await expect(page.getByText("Deadline runway (next 14 days)")).toBeVisible();
  await expect(
    page.getByText("Verifier ledger (latest draft per case)"),
  ).toBeVisible();
  await expect(page.getByText("Money at risk")).toBeVisible();
  await expect(
    page.getByText(/\$\d{1,3}(,\d{3})*\.\d{2}/).first(),
  ).toBeVisible();
});
