import { expect, test } from "@playwright/test";

test("DS-002: upload the fulfilment CSV, re-collect, case becomes Ready (AC-CASE-05)", async ({
  page,
}) => {
  await page.goto("/disputes/DS-002");
  await expect(page.getByText("Needs info.", { exact: true })).toBeVisible();

  const csv = await (
    await page.request.get("/api/fulfilment/sample.csv")
  ).text();
  await page.goto("/fulfilment");
  await page.getByText("…or paste CSV text").click();
  await page.getByLabel("CSV text").fill(csv);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/^Imported \d+ row/).first()).toBeVisible();

  await page.goto("/disputes/DS-002");
  await page.getByRole("button", { name: "Re-collect" }).click();
  await expect(page.getByText("Needs info.", { exact: true })).toBeHidden({
    timeout: 25_000,
  });
  await expect(page.getByText(/Evidence draft v\d/)).toBeVisible({
    timeout: 25_000,
  });
});
