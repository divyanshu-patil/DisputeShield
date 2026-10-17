import { expect, test } from "@playwright/test";

test("DS-001: citations, source drawer, failing edit blocked, approve and store a dry run (AC-UI-03, 04, 11, AC-VER-12, AC-SUB-02)", async ({
  page,
}) => {
  await page.goto("/disputes/DS-001");
  await expect(page.getByText("Evidence draft v1")).toBeVisible();
  await expect(page.getByText("✓ Verified")).toBeVisible();

  // A citation chip opens the fact's source record.
  await page
    .getByRole("button", { name: /^Show source for / })
    .first()
    .click();
  const drawer = page.getByRole("dialog", { name: /^Source:/ });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("JSON path")).toBeVisible();
  await page.keyboard.press("Escape");

  // An invented date fails the verifier; the passing version stays the one to approve.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Statement 1")
    .fill("The parcel was delivered on 2026-01-01.");
  await page.getByRole("button", { name: "Check with verifier" }).click();
  await expect(
    page.getByText("Some edits did not pass the verifier"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Evidence draft v1")).toBeVisible();

  await page.getByRole("button", { name: "Approve & send evidence" }).click();
  const modal = page.getByRole("dialog", {
    name: "Review and approve evidence",
  });
  await expect(modal.getByText("/provide-evidence")).toBeVisible();
  const store = modal.getByRole("button", { name: "Store (dry run)" });
  await expect(store).toBeDisabled();
  await modal.getByLabel("I have read this and approve it.").check();
  await store.click();
  await expect(
    page.getByText("Stored as a dry run. Nothing was sent to PayPal."),
  ).toBeVisible();
  await expect(page.getByText("Dry run stored", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & send evidence" }),
  ).toBeDisabled();
});
