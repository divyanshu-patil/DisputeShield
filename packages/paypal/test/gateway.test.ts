import { buildScenarios } from "@ds/fixtures";
import { describe, expect, it } from "vitest";
import {
  AuthError,
  LiveGateway,
  RateLimited,
  ReplayGateway,
  buildAcceptClaim,
  buildProvideEvidence,
  normaliseCarrier,
} from "../src/index.js";

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const token = () =>
  json(200, {
    access_token: "tok",
    token_type: "Bearer",
    expires_in: 3600,
    scope: "",
  });
const dispute = buildScenarios(new Date("2026-10-18T00:00:00Z")).disputes[0];

function fake(responses: Response[]) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url.replace("https://api-m.sandbox.paypal.com", ""));
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    return r;
  }) as typeof fetch;
  return { f, calls };
}

describe("LiveGateway", () => {
  it("caches_the_token", async () => {
    const { f, calls } = fake([
      token(),
      json(200, dispute),
      json(200, dispute),
    ]);
    const g = new LiveGateway({ clientId: "id", clientSecret: "s", fetch: f });
    await g.getDispute("DS-001");
    await g.getDispute("DS-001");
    expect(calls.filter((c) => c.startsWith("/v1/oauth2"))).toHaveLength(1);
  });

  it("refreshes_once_on_401_then_raises_auth_error (AC-SYNC-08)", async () => {
    const ok = fake([
      token(),
      json(401, { name: "AUTH" }),
      token(),
      json(200, dispute),
    ]);
    await expect(
      new LiveGateway({
        clientId: "id",
        clientSecret: "s",
        fetch: ok.f,
      }).getDispute("DS-001"),
    ).resolves.toBeDefined();
    const bad = fake([token(), json(401, {}), token(), json(401, {})]);
    await expect(
      new LiveGateway({
        clientId: "id",
        clientSecret: "s",
        fetch: bad.f,
      }).getDispute("DS-001"),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("retries_429_with_retry_after_and_5xx (AC-SYNC-09)", async () => {
    const waits: number[] = [];
    const { f } = fake([
      token(),
      json(429, {}, { "retry-after": "2" }),
      json(503, {}),
      json(200, dispute),
    ]);
    const g = new LiveGateway({
      clientId: "id",
      clientSecret: "s",
      fetch: f,
      sleep: async (ms) => void waits.push(ms),
    });
    await g.getDispute("DS-001");
    expect(waits).toEqual([2000, 1000]);
  });

  it("hands_long_retry_after_back_to_the_queue", async () => {
    const { f } = fake([token(), json(429, {}, { "retry-after": "60" })]);
    await expect(
      new LiveGateway({
        clientId: "id",
        clientSecret: "s",
        fetch: f,
      }).getDispute("X"),
    ).rejects.toBeInstanceOf(RateLimited);
  });

  it("webhook_verify_embeds_raw_body_and_requires_success", async () => {
    let sent = "";
    const f = (async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2")) return token();
      sent = init?.body as string;
      return json(200, { verification_status: "FAILURE" });
    }) as typeof fetch;
    const headers = {
      "paypal-transmission-id": "a",
      "paypal-transmission-time": "b",
      "paypal-cert-url": "c",
      "paypal-auth-algo": "d",
      "paypal-transmission-sig": "e",
    };
    const raw = '{"id":"WH-1",  "event_type":"X"}';
    const r = await new LiveGateway({
      clientId: "id",
      clientSecret: "s",
      fetch: f,
    }).verifyWebhook(headers, raw, "WHID");
    expect(r.ok).toBe(false);
    expect(sent).toContain(`"webhook_event":${raw}`);
    expect(
      (
        await new LiveGateway({
          clientId: "id",
          clientSecret: "s",
          fetch: f,
        }).verifyWebhook({}, raw, "W")
      ).detail,
    ).toMatch(/MISSING_HEADERS/);
  });
});

describe("ReplayGateway", () => {
  const g = new ReplayGateway(() => buildScenarios());
  it("serves_scenarios_without_network", async () => {
    expect((await g.listDisputes({})).body.items).toHaveLength(4);
    expect((await g.getDispute("DS-002")).body.reason).toBe(
      "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    );
    const s = await g.searchTransactions({
      startDate: "2000-01-01",
      endDate: "2100-01-01",
      transactionId: "5TY05013RG002845M",
    });
    expect(s.body.transaction_details).toHaveLength(1);
    await expect(g.getDispute("nope")).rejects.toThrow(/404/);
  });
});

describe("submission builders", () => {
  const facts = [
    { key: "tracking.number", display: "1Z999AA10123456784" },
    { key: "tracking.carrier", display: "ups" },
  ].map((f) => ({
    ...f,
    label: "",
    value: f.display,
    sourcePayloadId: "p",
    jsonPath: "",
    fetchedAt: "",
    confidence: "PAYPAL" as const,
  }));
  it("builds_proof_of_fulfillment", () => {
    const b = buildProvideEvidence("PROOF_OF_FULFILLMENT", facts, "Notes.");
    expect(b.evidences[0]?.evidence_info?.tracking_info).toEqual([
      { carrier_name: "UPS", tracking_number: "1Z999AA10123456784" },
    ]);
  });
  it("normalises_carriers", () => {
    expect(normaliseCarrier("Fed Ex")).toBe("FEDEX");
    expect(normaliseCarrier("us postal service")).toBe("USPS");
  });
  it("accept_claim_is_refund_only", () => {
    expect(buildAcceptClaim().accept_claim_type).toBe("REFUND");
  });
});
