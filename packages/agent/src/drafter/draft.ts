import {
  type Assessment,
  fallbackDraft,
  verifierPassed,
  verifyDraft,
} from "@ds/core";
import {
  type DraftOrigin,
  EvidenceDraft,
  type Fact,
  type VerifierReport,
} from "@ds/schemas";
import { extractJsonObject } from "../llm/json.js";
import type { LlmClient, OllamaMessage } from "../llm/types.js";
import { PROMPT_VERSION, systemPrompt, userMessage } from "./prompt.js";

// The drafter (05 section 4): prompt, extract JSON, zod, verifier, at most one parse repair and one
// verifier repair, then the template fallback. It never throws for model problems.

export type DraftMetrics = {
  path: DraftOrigin;
  repairedParse: number;
  repairedVerifier: number;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
  fallbackReason?: string;
};

export type DraftResult = {
  draft: EvidenceDraft;
  report: VerifierReport;
  passed: boolean;
  origin: DraftOrigin;
  model: string | null;
  promptVersion: string | null;
  metrics: DraftMetrics;
};

export type DraftOptions = {
  llm: LlmClient | null;
  model: string | null;
  reason: string;
  assessment: Assessment;
  facts: Fact[];
  maxStatements?: number;
  budgetMs?: number;
  now?: () => number;
};

const describe = (err: unknown) =>
  (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(
    0,
    200,
  );

export async function draftEvidence(o: DraftOptions): Promise<DraftResult> {
  const now = o.now ?? Date.now;
  const t0 = now();
  const max = o.maxStatements ?? 8;
  const allowed = o.assessment.evidenceType
    ? [o.assessment.evidenceType, "OTHER"]
    : ["OTHER"];
  const metrics: DraftMetrics = {
    path: "TEMPLATE_FALLBACK",
    repairedParse: 0,
    repairedVerifier: 0,
    latencyMs: 0,
  };

  const fallback = (why: string): DraftResult => {
    const draft = fallbackDraft(o.assessment, o.facts);
    const report = verifyDraft(draft, o.facts);
    metrics.latencyMs = now() - t0;
    metrics.fallbackReason = why;
    return {
      draft,
      report,
      passed: verifierPassed(report, o.assessment.checklist),
      origin: "TEMPLATE_FALLBACK",
      model: null,
      promptVersion: null,
      metrics,
    };
  };

  if (!o.llm || !o.model) return fallback("no model configured");
  const llm = o.llm;
  const model = o.model;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.budgetMs ?? 30_000);
  const messages: OllamaMessage[] = [
    { role: "system", content: systemPrompt(allowed, max) },
    {
      role: "user",
      content: userMessage(o.reason, allowed, o.assessment, o.facts, max),
    },
  ];
  const ask = async () => {
    const res = await llm.chat(
      { model, messages, options: { temperature: 0.2 } },
      { signal: ac.signal },
    );
    metrics.promptTokens =
      (metrics.promptTokens ?? 0) + (res.prompt_eval_count ?? 0);
    metrics.outputTokens = (metrics.outputTokens ?? 0) + (res.eval_count ?? 0);
    messages.push({ role: "assistant", content: res.message.content });
    return res.message.content;
  };
  const parse = (text: string) => {
    const obj = extractJsonObject(text);
    if (obj === undefined) return { error: "no JSON object found" };
    const d = EvidenceDraft.safeParse(obj);
    if (!d.success)
      return {
        error: d.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
    if (!allowed.includes(d.data.evidenceType))
      return { error: `evidenceType must be one of ${allowed.join(", ")}` };
    if (d.data.statements.length < 1 || d.data.statements.length > max)
      return { error: `statements must have 1 to ${max} items` };
    return { draft: d.data };
  };

  try {
    let parsed = parse(await ask());
    if (!parsed.draft) {
      metrics.repairedParse++;
      messages.push({
        role: "user",
        content: `Your answer could not be used: ${parsed.error}. Reply with only the JSON object in the required shape.`,
      });
      parsed = parse(await ask());
    }
    if (!parsed.draft)
      return fallback(`unparseable after repair: ${parsed.error ?? ""}`);
    let draft = parsed.draft;
    let report = verifyDraft(draft, o.facts);
    if (report.rejected.length > 0) {
      metrics.repairedVerifier++;
      const list = report.rejected
        .map((r) => `- "${r.statement.text}" (${r.reason}: ${r.detail ?? ""})`)
        .join("\n");
      messages.push({
        role: "user",
        content: `These statements were rejected by the fact checker:\n${list}\nRewrite them using only exact fact values and cite the right keys, or drop them. Reply with the full JSON object.`,
      });
      const again = parse(await ask());
      if (!again.draft) return fallback("unparseable after verifier repair");
      draft = again.draft;
      report = verifyDraft(draft, o.facts);
    }
    if (report.rejected.length > 0 || report.accepted.length === 0)
      return fallback(
        `verifier rejected statements after repair: ${report.rejected
          .map((r) => `${r.reason} ${r.detail ?? ""}`)
          .join("; ")}`.slice(0, 300),
      );
    const origin: DraftOrigin =
      metrics.repairedParse + metrics.repairedVerifier > 0
        ? "MODEL_REPAIRED"
        : "MODEL";
    metrics.path = origin;
    metrics.latencyMs = now() - t0;
    return {
      draft,
      report,
      passed: verifierPassed(report, o.assessment.checklist),
      origin,
      model,
      promptVersion: PROMPT_VERSION,
      metrics,
    };
  } catch (err) {
    return fallback(describe(err));
  } finally {
    clearTimeout(timer);
  }
}
