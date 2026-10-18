import type { EvidenceDraft, EvidenceStatement, Fact } from "@ds/schemas";
import { RECORDED } from "./recorded-drafts.js";

// AC-DEMO-03: a real model draft, recorded by `pnpm ds eval:live --record`, shown in replay mode when no
// LLM key is set. Fact values are stored as {{fact.key}} because the demo facts are dated from the seed
// day; the drafter re-binds them to the current facts and the verifier checks the result as usual.

export type RecordedDraft = {
  model: string;
  promptVersion: string;
  recordedAt: string;
  draft: EvidenceDraft;
};

const mapStatements = (
  d: EvidenceDraft,
  f: (s: EvidenceStatement) => string,
): EvidenceDraft => ({
  ...d,
  statements: d.statements.map((s) => ({ ...s, text: f(s) })),
  recommendation: {
    ...d.recommendation,
    rationale: d.recommendation.rationale.map((s) => ({ ...s, text: f(s) })),
  },
});

export function templateDraft(d: EvidenceDraft, facts: Fact[]): EvidenceDraft {
  const byKey = new Map(facts.map((f) => [f.key, f.display]));
  return mapStatements(d, (s) =>
    s.factKeys
      .map((k) => [k, byKey.get(k) ?? ""] as const)
      .filter(([, v]) => v.length > 0)
      .sort(([, a], [, b]) => b.length - a.length)
      .reduce((t, [k, v]) => t.replaceAll(v, `{{${k}}}`), s.text),
  );
}

export function fillDraft(d: EvidenceDraft, facts: Fact[]): EvidenceDraft {
  const byKey = new Map(facts.map((f) => [f.key, f.display]));
  // A missing key stays as {{key}}, which the verifier rejects, so the template fallback takes over.
  return mapStatements(d, (s) =>
    s.text.replace(/\{\{([^}]+)\}\}/g, (m, k: string) => byKey.get(k) ?? m),
  );
}

export function recordedDraft(
  disputeId: string,
  facts: Fact[],
): RecordedDraft | null {
  const r = RECORDED[disputeId];
  return r ? { ...r, draft: fillDraft(r.draft, facts) } : null;
}
