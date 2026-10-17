import { FULFILMENT_COLUMNS, FulfilmentCsvRow } from "@ds/schemas";

// Fulfilment CSV (05 section 2.4): fixed header order, one row per PayPal transaction. Quoted fields with
// commas and doubled quotes are supported; anything else is a row error with its line number.

export type CsvError = { line: number; column?: string; message: string };

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseFulfilmentCsv(text: string): {
  rows: FulfilmentCsvRow[];
  errors: CsvError[];
} {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = splitLine(lines[0] ?? "");
  if (header.join(",") !== FULFILMENT_COLUMNS.join(",")) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `header must be exactly: ${FULFILMENT_COLUMNS.join(",")}`,
        },
      ],
    };
  }
  const rows: FulfilmentCsvRow[] = [];
  const errors: CsvError[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const n = i + 2;
    if (!line.trim()) return;
    const cells = splitLine(line);
    if (cells.length !== FULFILMENT_COLUMNS.length) {
      errors.push({
        line: n,
        message: `expected ${FULFILMENT_COLUMNS.length} columns, found ${cells.length}`,
      });
      return;
    }
    const parsed = FulfilmentCsvRow.safeParse(
      Object.fromEntries(FULFILMENT_COLUMNS.map((c, j) => [c, cells[j]])),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        errors.push({
          line: n,
          column: String(issue.path[0] ?? ""),
          message: issue.message,
        });
      return;
    }
    if (seen.has(parsed.data.paypal_transaction_id)) {
      errors.push({
        line: n,
        column: "paypal_transaction_id",
        message: "appears twice in this file",
      });
      return;
    }
    seen.add(parsed.data.paypal_transaction_id);
    rows.push(parsed.data);
  });
  return { rows, errors };
}
