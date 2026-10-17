import type {
  ChecklistItem,
  EvidenceDraft,
  EvidenceStatement,
  Fact,
  RejectReason,
  VerifierReport,
} from "@ds/schemas";
import { blockingMet } from "../checklist/checklist.js";
import { CLAIM_WORDS, extractTokens, tokenMatches } from "./tokens.js";

// verifyDraft (05-evidence-engine-spec.md section 5). Pure: no I/O, no clock. Facts are data: their text
// never changes what the verifier does (AC-VER-10).

export const MAX_STATEMENT_CHARS = 400;
export const MAX_NOTES_CHARS = 2000;

/** Internal citation markers like "[tracking.number]" never reach PayPal. */
const CITATION_MARKER =
  /\s*\[[a-z_]+(?:\.[a-z_]+)+(?:\s*,\s*[a-z_]+(?:\.[a-z_]+)+)*\]/g;
export const stripCitations = (text: string): string =>
  text.replace(CITATION_MARKER, "").trim();

export function checkStatement(
  s: EvidenceStatement,
  facts: Map<string, Fact>,
): { reason: RejectReason; detail: string } | null {
  const text = stripCitations(s.text);
  if (s.factKeys.length === 0)
    return { reason: "NO_CITATION", detail: "cites no facts" };
  if ((text.match(/[A-Za-z]{3,}/g) ?? []).length < 2) {
    return { reason: "NO_CITATION", detail: "statement has no content words" };
  }
  if (text.length > MAX_STATEMENT_CHARS) {
    return {
      reason: "TOO_LONG",
      detail: `${text.length} characters (max ${MAX_STATEMENT_CHARS})`,
    };
  }
  const unknown = s.factKeys.filter((k) => !facts.has(k));
  if (unknown.length > 0)
    return {
      reason: "UNKNOWN_FACT",
      detail: `unknown fact ${unknown.join(", ")}`,
    };

  const cited = s.factKeys.flatMap((k) =>
    extractTokens(facts.get(k)?.display ?? ""),
  );
  for (const t of extractTokens(text)) {
    if (!tokenMatches(t, cited)) {
      return {
        reason: "VALUE_MISMATCH",
        detail: `"${t.raw}" does not match any cited fact`,
      };
    }
  }
  for (const claim of CLAIM_WORDS) {
    if (claim.re.test(text) && !s.factKeys.some(claim.needs)) {
      return {
        reason: "UNKNOWN_FACT",
        detail: `"${claim.word}" needs a cited fact that shows it`,
      };
    }
  }
  return null;
}

/** Joins sentences and cuts at the last full sentence that fits (AC-VER-08). */
export function fitNotes(sentences: string[], max = MAX_NOTES_CHARS): string {
  let out = "";
  for (const raw of sentences) {
    const s = /[.!?]$/.test(raw.trim()) ? raw.trim() : `${raw.trim()}.`;
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

export function verifyDraft(
  draft: EvidenceDraft,
  facts: Fact[],
): VerifierReport {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const accepted: EvidenceStatement[] = [];
  const rejected: VerifierReport["rejected"] = [];
  for (const s of draft.statements) {
    const problem = checkStatement(s, byKey);
    if (problem)
      rejected.push({
        statement: s,
        reason: problem.reason,
        detail: problem.detail,
      });
    else accepted.push({ text: stripCitations(s.text), factKeys: s.factKeys });
  }
  const citedKeys = [...new Set(accepted.flatMap((s) => s.factKeys))];
  const citationAppendix = citedKeys.flatMap((k) => {
    const f = byKey.get(k);
    return f
      ? [
          {
            factKey: k,
            label: f.label,
            display: f.display,
            payloadId: f.sourcePayloadId,
            jsonPath: f.jsonPath,
          },
        ]
      : [];
  });
  const refs = citationAppendix
    .filter((c) => !c.factKey.startsWith("derived."))
    .map((c) => `${c.label}: ${c.display}`)
    .join("; ");
  const sentences = accepted.map((s) => s.text);
  const notesText = fitNotes(
    refs ? [...sentences, `Records referenced: ${refs}`] : sentences,
  );
  return { accepted, rejected, notesText, citationAppendix };
}

/** AC-VER-09: at least one accepted, none rejected, every blocking checklist item MET. */
export const verifierPassed = (
  report: VerifierReport,
  checklist: ChecklistItem[],
): boolean =>
  report.accepted.length > 0 &&
  report.rejected.length === 0 &&
  blockingMet(checklist);
