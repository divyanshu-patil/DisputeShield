import { expect, test } from "@playwright/test";

test("DS-004: no drafting for this reason, accept claim stores a dry run (AC-CASE-06, AC-SUB-07)", async ({
  page,
}) => {
  await page.goto("/disputes/DS-004");
  await expect(
    page.getByText(
      "Dispute Shield does not draft evidence for this reason yet",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & send evidence" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Accept claim and refund" }).click();
  const modal = page.getByRole("dialog", {
    name: /^Accept claim and refund \$64\.00$/,
  });
  await expect(modal.getByText("/accept-claim")).toBeVisible();
  await modal.getByLabel("I have read this and approve it.").check();
  await modal.getByRole("button", { name: "Store (dry run)" }).click();
  await expect(
    page.getByText("Stored as a dry run. Nothing was sent to PayPal."),
  ).toBeVisible();
});
