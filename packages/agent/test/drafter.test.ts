import { assessCase } from "@ds/core";
import type { Fact } from "@ds/schemas";
import { describe, expect, it } from "vitest";
import {
  LlmRateLimitError,
  type LlmClient,
  draftEvidence,
} from "../src/index.js";

const f = (
  key: string,
  display: string,
  confidence: Fact["confidence"] = "PAYPAL",
): Fact => ({
  key,
  label: key,
  value: display,
  display,
  sourcePayloadId: "p",
  jsonPath: key,
  fetchedAt: "2026-10-01T00:00:00Z",
  confidence,
});
const facts = [
  f("dispute.opened_at", "2026-10-02"),
  f("dispute.amount", "USD 48.00"),
  f("tracking.number", "1Z999AA10123456784"),
  f("tracking.carrier", "UPS"),
  f("tracking.on_paypal", "Yes"),
  f("fulfil.shipped_at", "2026-09-25", "SELLER_UPLOAD"),
  f("fulfil.delivered_at", "2026-09-29", "SELLER_UPLOAD"),
  f("derived.ship_address_match", "Yes", "DERIVED"),
  f("fulfil.ship_to.postal_code", "95131", "SELLER_UPLOAD"),
];
const assessment = assessCase("MERCHANDISE_OR_SERVICE_NOT_RECEIVED", facts);
const good = {
  evidenceType: "PROOF_OF_FULFILLMENT",
  statements: [
    {
      text: "Tracking number 1Z999AA10123456784 with carrier UPS was recorded.",
      factKeys: ["tracking.number", "tracking.carrier"],
    },
  ],
  recommendation: { action: "FIGHT", rationale: [] },
};
const bad = {
  ...good,
  statements: [
    {
      text: "Tracking number 1Z999AA10123456799 was recorded.",
      factKeys: ["tracking.number"],
    },
  ],
};

function scripted(replies: (string | Error)[]): LlmClient & { calls: number } {
  const c = {
    calls: 0,
    async chat() {
      const r = replies[c.calls++];
      if (r instanceof Error) throw r;
      return { message: { content: r ?? "" } };
    },
    async listModels() {
      return [];
    },
  };
  return c;
}
const run = (llm: LlmClient | null) =>
  draftEvidence({
    llm,
    model: "m",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    assessment,
    facts,
  });

describe("drafter (AC-EVID, AC-LLM)", () => {
  it("model_draft_passes", async () => {
    const r = await run(scripted([`Here you go: ${JSON.stringify(good)}`]));
    expect(r.origin).toBe("MODEL");
    expect(r.passed).toBe(true);
    expect(r.promptVersion).toBe("drafter.v1");
  });
  it("repairs_unparseable_output_once", async () => {
    const llm = scripted(["not json", JSON.stringify(good)]);
    const r = await run(llm);
    expect(r.origin).toBe("MODEL_REPAIRED");
    expect(r.metrics.repairedParse).toBe(1);
  });
  it("repairs_verifier_rejections_once_then_falls_back", async () => {
    const r = await run(scripted([JSON.stringify(bad), JSON.stringify(bad)]));
    expect(r.origin).toBe("TEMPLATE_FALLBACK");
    expect(r.passed).toBe(true);
    expect(r.metrics.repairedVerifier).toBe(1);
  });
  it("falls_back_on_rate_limit (AC-LLM)", async () => {
    const r = await run(scripted([new LlmRateLimitError(5)]));
    expect(r.origin).toBe("TEMPLATE_FALLBACK");
    expect(r.metrics.fallbackReason).toMatch(/RateLimit/);
  });
  it("falls_back_without_a_model", async () => {
    expect((await run(null)).origin).toBe("TEMPLATE_FALLBACK");
  });
  it("sends_no_raw_payloads_or_pii", async () => {
    let sent = "";
    const llm: LlmClient = {
      async chat(req) {
        sent = JSON.stringify(req);
        return { message: { content: JSON.stringify(good) } };
      },
      async listModels() {
        return [];
      },
    };
    await run(llm);
    expect(sent).not.toMatch(
      /Jordan|example\.com|Test Street|sourcePayloadId|jsonPath/,
    );
  });
});
