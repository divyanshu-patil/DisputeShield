import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assessCase,
  checkStatement,
  fallbackDraft,
  verifierPassed,
  verifyDraft,
} from "@ds/core";
import type { EvidenceStatement, Fact } from "@ds/schemas";
import { describe, expect, it } from "vitest";

// 09 section 5.1: hand-written model outputs against the real verifier. Pass bar (AC-VER-11): every
// adversarial statement rejected with its listed reason, every golden statement accepted.

type Row = [
  key: string,
  label: string,
  display: string,
  confidence: Fact["confidence"],
];
type FactSet = { reason: string; facts: Row[] };

const DIR = join(import.meta.dirname, "cases");
const sets = JSON.parse(
  readFileSync(join(DIR, "facts.json"), "utf8"),
) as Record<string, FactSet>;
const load = <T>(sub: string) =>
  readdirSync(join(DIR, sub))
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) =>
        [
          f.replace(/\.json$/, ""),
          JSON.parse(readFileSync(join(DIR, sub, f), "utf8")) as T,
        ] as const,
    );

function factsFor(name: string, extra: Row[] = []): Fact[] {
  const set = sets[name];
  if (!set) throw new Error(`unknown fact set ${name}`);
  return [...set.facts, ...extra].map(([key, label, display, confidence]) => ({
    key,
    label,
    value: display,
    display,
    sourcePayloadId: "eval",
    jsonPath: key,
    fetchedAt: "2026-10-12T00:00:00Z",
    confidence,
  }));
}

describe("golden: accepted 100%", () => {
  it.each(
    load<{
      factSet: string;
      extraFacts: Row[];
      statements: EvidenceStatement[];
    }>("golden"),
  )("%s", (_name, c) => {
    const facts = new Map(
      factsFor(c.factSet, c.extraFacts).map((f) => [f.key, f]),
    );
    for (const s of c.statements)
      expect({ text: s.text, result: checkStatement(s, facts) }).toEqual({
        text: s.text,
        result: null,
      });
  });

  it.each(Object.keys(sets))(
    "template fallback for %s passes the verifier",
    (name) => {
      const facts = factsFor(name);
      const a = assessCase(sets[name]?.reason ?? "", facts);
      const report = verifyDraft(fallbackDraft(a, facts), facts);
      expect(report.rejected).toEqual([]);
      expect(verifierPassed(report, a.checklist)).toBe(true);
    },
  );
});

describe("adversarial: rejected 100%", () => {
  it.each(
    load<{
      factSet: string;
      extraFacts: Row[];
      statement: EvidenceStatement;
      expect: string;
    }>("adversarial"),
  )("%s", (_name, c) => {
    const facts = new Map(
      factsFor(c.factSet, c.extraFacts).map((f) => [f.key, f]),
    );
    expect(checkStatement(c.statement, facts)?.reason).toBe(c.expect);
  });
});
