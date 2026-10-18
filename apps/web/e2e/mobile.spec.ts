import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

for (const path of ["/disputes", "/disputes/DS-003"]) {
  test(`no horizontal page scroll at 390 px on ${path} (AC-UI-07)`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.locator("main h1").first().waitFor();
    // Lists the elements that stick out, so a failure says what to fix. Content inside its own
    // horizontal scroller (the nav pills, the grid) cannot scroll the page.
    const wide = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const inScroller = (el: Element) => {
        for (let p = el.parentElement; p; p = p.parentElement)
          if (/auto|scroll|hidden/.test(getComputedStyle(p).overflowX))
            return true;
        return false;
      };
      return [...document.querySelectorAll("body *")]
        .filter(
          (el) =>
            el.getBoundingClientRect().right > w + 0.5 &&
            !el.closest(".ag-root-wrapper") &&
            !inScroller(el),
        )
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`,
        );
    });
    expect(wide).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
