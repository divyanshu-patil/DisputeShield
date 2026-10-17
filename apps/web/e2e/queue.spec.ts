import { expect, test } from "@playwright/test";
import { columnText } from "./grid";

test("queue lists the four demo disputes, nearest deadline first, with filters (AC-UI-01, 02)", async ({
  page,
}) => {
  await page.goto("/disputes");
  await expect(page.getByText("Replay data").first()).toBeVisible();
  await expect(page.getByText("Dry run").first()).toBeVisible();
  const ids = () => columnText(page, "id");
  await expect.poll(ids).toEqual(["DS-002", "DS-001", "DS-003", "DS-004"]);

  await page
    .getByLabel("Reason")
    .selectOption({ label: "Credit not processed" });
  await expect.poll(ids).toEqual(["DS-003"]);
  await expect(page).toHaveURL(/reason=/);
  await page.getByLabel("Reason").selectOption("");
  await page.getByLabel("Filter disputes").fill("DS-004");
  await expect.poll(ids).toEqual(["DS-004"]);
});
