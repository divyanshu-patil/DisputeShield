import { readFileSync } from "node:fs";
import type { Fact } from "@ds/schemas";
import { describe, expect, it } from "vitest";
import {
  type LlmClient,
  LlmRateLimitError,
  type OllamaChatRequest,
  type OllamaChatResponse,
  UNVERIFIED_ANSWER,
  askCopilot,
  paypalReadToolDefs,
  recordTools,
} from "../src/index.js";

const dispute = JSON.parse(
  readFileSync(
    new URL(
      "../../fixtures/paypal/disputes/PP-R-AUY-10193248.resolved.details.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  dispute_id: string;
  disputed_transactions: { buyer: { email?: string } }[];
};

const caseFacts: Fact[] = [
  {
    key: "tracking.number",
    label: "Tracking number",
    value: "1Z999AA10123456784",
    display: "1Z999AA10123456784",
    sourcePayloadId: "p1",
    jsonPath: "tracking_number",
    fetchedAt: "2026-10-18T00:00:00Z",
    confidence: "PAYPAL",
  },
];

type Reply = Partial<OllamaChatResponse["message"]> | Error;
function scripted(replies: Reply[]) {
  const sent: OllamaChatRequest[] = [];
  const llm: LlmClient = {
    async chat(req) {
      sent.push(structuredClone(req));
      const r = replies[sent.length - 1];
      if (r instanceof Error) throw r;
      return { message: { content: "", ...r } };
    },
    async listModels() {
      return [];
    },
  };
  return { llm, sent };
}

function tools() {
  const stored: { source: string; ref: string }[] = [];
  const list = recordTools(
    {
      tools: paypalReadToolDefs(),
      call: async (name) =>
        name === "get_dispute" ? JSON.stringify(dispute) : "error: nope",
    },
    async (source, ref) => (
      stored.push({ source, ref }),
      `pid-${stored.length}`
    ),
    () => new Date("2026-10-18T12:00:00Z"),
  );
  return { list, stored };
}

const ask = (llm: LlmClient, t = tools().list) =>
  askCopilot({
    llm,
    model: "m",
    disputeId: "DS-001",
    facts: caseFacts,
    tools: t,
    question: "What is the status?",
  });

describe("Case Copilot (05 section 9, AC-AI-03)", () => {
  it("offers only the four read tools", () => {
    expect(
      paypalReadToolDefs()
        .map((t) => t.function.name)
        .sort(),
    ).toEqual([
      "get_dispute",
      "get_order",
      "get_shipment_tracking",
      "list_transactions",
    ]);
  });

  it("stores each tool result and gives the model facts, never the payload", async () => {
    const t = tools();
    const { llm, sent } = scripted([
      {
        tool_calls: [
          {
            function: {
              name: "get_dispute",
              arguments: { dispute_id: dispute.dispute_id },
            },
          },
        ],
      },
      { content: "The amount in dispute is USD 36.00 [dispute.amount]." },
    ]);
    const r = await ask(llm, t.list);
    expect(t.stored).toEqual([
      { source: "copilot.get_dispute", ref: dispute.dispute_id },
    ]);
    expect(r.toolCalls[0]?.name).toBe("get_dispute");
    expect(r.toolCalls[0]?.facts).toBeGreaterThan(0);
    const toolMsg = sent[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toMatch(/^\[dispute\./);
    const email = dispute.disputed_transactions[0]?.buyer.email;
    if (email) expect(JSON.stringify(sent)).not.toContain(email);
    expect(r.verified).toBe(true);
    expect(r.facts.map((f) => f.sourcePayloadId)).toEqual(["pid-1"]);
  });

  it("replaces an answer that fails the token check", async () => {
    const { llm } = scripted([
      {
        content: "The tracking number is 1Z999AA10123456799 [tracking.number].",
      },
    ]);
    const r = await ask(llm);
    expect(r.verified).toBe(false);
    expect(r.answer).toBe(UNVERIFIED_ANSWER);
    expect(r.facts).toEqual(caseFacts);
  });

  it("does not treat the case's own id as an uncited value", async () => {
    const { llm } = scripted([
      {
        content:
          "Dispute DS-001 has tracking number 1Z999AA10123456784 [tracking.number].",
      },
    ]);
    expect((await ask(llm)).verified).toBe(true);
  });

  it("stops offering tools after six rounds", async () => {
    const call = {
      tool_calls: [{ function: { name: "get_order", arguments: { id: "X" } } }],
    };
    const { llm, sent } = scripted([
      ...Array.from({ length: 7 }, () => call),
      { content: "I can't see that." },
    ]);
    const r = await ask(llm);
    expect(sent).toHaveLength(7);
    expect(sent[6]?.tools).toBeUndefined();
    expect(r.toolCalls).toHaveLength(6);
  });

  it("says the AI is unavailable on a provider error", async () => {
    const r = await ask(scripted([new LlmRateLimitError(5)]).llm);
    expect(r.verified).toBe(false);
    expect(r.answer).toMatch(/not available/);
  });
});
