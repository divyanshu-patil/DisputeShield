import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/disputes",
  "/disputes/DS-003",
  "/risk",
  "/health",
  "/fulfilment",
  "/audit",
  "/setup",
];

for (const path of PAGES) {
  test(`no serious or critical axe violations on ${path} (AC-UI-06)`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.locator("main h1").first().waitFor();
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      bad.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(", ")}`,
      ),
    ).toEqual([]);
  });
}
