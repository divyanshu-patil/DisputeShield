import type { Page } from "@playwright/test";

/** Text of one column in displayed order (AG Grid positions rows by row-index, not DOM order). */
export function columnText(
  page: Page,
  colId: string,
  scope = "main",
): Promise<string[]> {
  return page.evaluate(
    ([col, root]) =>
      [...document.querySelectorAll(`${root} .ag-row`)]
        .sort(
          (a, b) =>
            Number(a.getAttribute("row-index")) -
            Number(b.getAttribute("row-index")),
        )
        .map(
          (r) =>
            r.querySelector(`[col-id="${col}"]`)?.textContent?.trim() ?? "",
        ),
    [colId, scope] as const,
  );
}
