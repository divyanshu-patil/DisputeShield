import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenarios } from "@ds/fixtures";
import {
  PaypalDisputeDetails,
  PaypalDisputeList,
  PaypalOrder,
  PaypalTransactionDetail,
  PaypalTransactionSearch,
} from "@ds/schemas";
import type { z } from "zod";

// `pnpm ds replay-check` (03 section 7, 09): every recorded fixture and every demo scenario parses against
// its @ds/schemas schema, and no recorded fixture holds an email outside example.com (fixtures are redacted).

const DIR = fileURLToPath(
  new URL("../../../../packages/fixtures/paypal", import.meta.url),
);

const RULES: [RegExp, z.ZodType][] = [
  [/^disputes\/list.*\.json$/, PaypalDisputeList],
  [/^disputes\/.*details\.json$/, PaypalDisputeDetails],
  [/^transactions\/search.*\.json$/, PaypalTransactionSearch],
  [/^orders\/.*\.json$/, PaypalOrder],
];
const EMAIL = /[\w.%+-]+@([\w-]+\.)+[a-z]{2,}/gi;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export function replayCheck(dir = DIR): string[] {
  const problems: string[] = [];
  for (const path of files(dir).filter((p) => p.endsWith(".json"))) {
    const rel = relative(dir, path).replaceAll("\\", "/");
    const text = readFileSync(path, "utf8");
    const leaked = (text.match(EMAIL) ?? []).filter(
      (m) => !m.toLowerCase().endsWith("@example.com"),
    );
    if (leaked.length) problems.push(`${rel}: unredacted email address`);
    const schema = RULES.find(([re]) => re.test(rel))?.[1];
    if (!schema) continue;
    const r = schema.safeParse(JSON.parse(text));
    if (!r.success)
      problems.push(
        `${rel}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
  }
  const s = buildScenarios();
  const sets: [string, unknown[], z.ZodType][] = [
    ["scenario dispute", s.disputes, PaypalDisputeDetails],
    ["scenario transaction", s.transactions, PaypalTransactionDetail],
    ["scenario order", s.orders, PaypalOrder],
  ];
  for (const [name, items, schema] of sets)
    items.forEach((item, i) => {
      const r = schema.safeParse(item);
      if (!r.success) problems.push(`${name} ${i}: ${r.error.message}`);
    });
  return problems;
}

export function runReplayCheck(): void {
  const problems = replayCheck();
  for (const p of problems) console.error(`FAIL ${p}`);
  if (problems.length) process.exitCode = 1;
  else
    console.log(
      "replay-check: every fixture and scenario parses; no unredacted emails.",
    );
}
