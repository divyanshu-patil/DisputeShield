import { expect, test as setup } from "@playwright/test";
import { ACCESS_CODE } from "../playwright.config";

// Signs in once and reloads the demo shop, so every run starts from the same data.
setup("sign in and reseed", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Access code").fill(ACCESS_CODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/disputes/);
  const res = await page.request.post("/api/demo/seed");
  expect(res.ok()).toBe(true);
  expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  await page.context().storageState({ path: "e2e/.auth.json" });
});
