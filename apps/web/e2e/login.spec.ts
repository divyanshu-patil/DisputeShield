import { expect, test } from "@playwright/test";
import { ACCESS_CODE } from "../playwright.config";

test.use({ storageState: { cookies: [], origins: [] } });

test("wrong code is refused, right code opens the queue (AC-UI-10)", async ({
  page,
}) => {
  await page.goto("/disputes");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Access code").fill("not-the-code");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("That access code was not accepted"),
  ).toBeVisible();
  await page.getByLabel("Access code").fill(ACCESS_CODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/disputes$/);
});
