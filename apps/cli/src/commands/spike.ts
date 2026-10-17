import { mkdirSync, writeFileSync } from "node:fs";
import {
  type EvidenceInput,
  PayPalError,
  SANDBOX_BASE_URL,
  evidenceFormA,
  paypalGet,
  paypalRequest,
  redact,
  requestToken,
} from "@ds/paypal";
import {
  PaypalDisputeDetails,
  PaypalDisputeList,
  PaypalOrder,
  PaypalTransactionSearch,
} from "@ds/schemas";
import { z } from "zod";
import { paypalCredentials, paypalWebhookId } from "../lib/env.js";
import { s9 } from "./spike-s9.js";

// Day-0 spikes (docs/11-risks-and-day0-spikes.md). Never print secrets or tokens.

const FIXTURES = new URL(
  "../../../../packages/fixtures/paypal/",
  import.meta.url,
);

// Contract section 1 ✅: scopes this project needs beyond default dispute read access.
const NEEDED_SCOPES = {
  "https://uri.paypal.com/services/disputes/update-seller":
    "dispute actions (provide evidence, accept claim)",
  "https://uri.paypal.com/services/reporting/search/read":
    'Transaction search (enable "Transaction search" on the REST app)',
};

function saveFixture(path: string, body: unknown): string {
  const file = new URL(path, FIXTURES);
  mkdirSync(new URL(".", file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(redact(body), null, 2)}\n`);
  return `packages/fixtures/paypal/${path}`;
}

async function s0(): Promise<void> {
  console.log(`S0 token request -> ${SANDBOX_BASE_URL}/v1/oauth2/token`);
  const token = await requestToken(paypalCredentials());
  const expiresAt = new Date(
    Date.now() + token.expiresInSeconds * 1000,
  ).toISOString();
  console.log(
    `PASS token obtained (${token.tokenType}), expires in ${token.expiresInSeconds} s (about ${expiresAt})`,
  );
  console.log(`scopes (${token.scopes.length}):`);
  for (const scope of [...token.scopes].sort()) console.log(`  ${scope}`);
  console.log("needed by this project:");
  for (const [scope, why] of Object.entries(NEEDED_SCOPES)) {
    console.log(
      `  ${token.scopes.includes(scope) ? "present" : "MISSING"}  ${scope}  (${why})`,
    );
  }
  console.log(
    `fixture: ${saveFixture("oauth/token.json", token.raw)} (redacted; read it before committing)`,
  );
}

// The list response shape is what S2 records; read it leniently here.
const DisputeList = z
  .object({
    items: z
      .array(z.object({ dispute_id: z.string() }).passthrough())
      .optional(),
  })
  .passthrough();
const text = (v: unknown): string => (typeof v === "string" ? v : "?");

/** S1 pass check: the seller can see at least one dispute (GET /v1/customer/disputes, contract 2.1). */
async function s1(): Promise<void> {
  const token = await requestToken(paypalCredentials());
  const res = await paypalGet("/v1/customer/disputes", token.accessToken);
  const list = DisputeList.safeParse(res.body);
  const debug = res.debugId ? ` (debug_id ${res.debugId})` : "";
  if (!list.success || !list.data.items) {
    const keys =
      res.body && typeof res.body === "object"
        ? Object.keys(res.body).join(", ")
        : typeof res.body;
    console.log(
      `HTTP ${res.status}${debug}: no "items" array in the response; top-level keys: ${keys}`,
    );
    process.exitCode = 1;
    return;
  }
  const items = list.data.items;
  console.log(
    `HTTP ${res.status}${debug}: ${items.length} dispute(s) visible to the seller`,
  );
  for (const d of items) {
    console.log(
      `  ${d.dispute_id}  status=${text(d["status"])}  reason=${text(d["reason"])}  created=${text(d["create_time"])}`,
    );
  }
  if (items.length === 0) {
    console.log(
      "FAIL no disputes yet: open one as the buyer (Route B), wait a few minutes, re-run",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "PASS the seller can read disputes; next: ds spike s2 saves them as fixtures",
    );
  }
}

/**
 * S2: list (with update_time_after) and details for every dispute; parse them against the draft
 * schemas and save redacted fixtures. Prints only enums, ids and field presence.
 */
async function s2(): Promise<void> {
  const token = await requestToken(paypalCredentials());
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const res = await paypalGet(
    `/v1/customer/disputes?update_time_after=${encodeURIComponent(since)}`,
    token.accessToken,
  );
  const list = PaypalDisputeList.safeParse(res.body);
  console.log(
    `list HTTP ${res.status}: ${list.success ? `${list.data.items.length} dispute(s), parses` : `DOES NOT PARSE: ${list.error.message}`}`,
  );
  console.log(
    `fixture: ${saveFixture("disputes/list.sandbox.json", res.body)}`,
  );
  if (!list.success) return void (process.exitCode = 1);

  for (const { dispute_id } of list.data.items) {
    const d = await paypalGet(
      `/v1/customer/disputes/${encodeURIComponent(dispute_id)}`,
      token.accessToken,
    );
    const parsed = PaypalDisputeDetails.safeParse(d.body);
    const file = saveFixture(`disputes/${dispute_id}.details.json`, d.body);
    if (!parsed.success) {
      console.log(
        `${dispute_id}: DOES NOT PARSE (${file}): ${parsed.error.message}`,
      );
      process.exitCode = 1;
      continue;
    }
    const x = parsed.data;
    console.log(
      [
        `${dispute_id}  status=${x.status} state=${x.dispute_state ?? "-"} stage=${x.dispute_life_cycle_stage ?? "-"}`,
        `  reason=${x.reason} amount=${x.dispute_amount.value} ${x.dispute_amount.currency_code} due=${x.seller_response_due_date ?? "absent"}`,
        `  links: ${x.links.map((l) => l.rel).join(", ")}`,
        `  allowed_response_options: ${Object.keys(x.allowed_response_options ?? {}).join(", ") || "none"}`,
        `  messages: ${x.messages?.length ?? 0}, evidences: ${(x.evidences ?? []).map((e) => e.evidence_type).join(", ") || "none"}`,
        `  fixture: ${file}`,
      ].join("\n"),
    );
  }
}

export type SpikeOptions = {
  dispute?: string;
  order?: string;
  send?: boolean;
  carrier?: string;
  file?: boolean;
  models?: string;
  runs?: string;
  toolkit?: boolean;
};

// 1x1 transparent PNG: the smallest valid image, for the file-part test in S3.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Fetches details and checks the HATEOAS link before any write (contract 2.2 design rule). */
async function detailsWithLink(id: string, rel: string, accessToken: string) {
  const res = await paypalGet(
    `/v1/customer/disputes/${encodeURIComponent(id)}`,
    accessToken,
  );
  const d = PaypalDisputeDetails.parse(res.body);
  console.log(
    `${id}: status=${d.status} stage=${d.dispute_life_cycle_stage ?? "-"} links=${d.links.map((l) => l.rel).join(",")}`,
  );
  return { d, link: d.links.find((l) => l.rel === rel) };
}

/** Writes are shown first and sent only with --send. */
async function write(
  opts: SpikeOptions,
  label: string,
  id: string,
  rel: string,
  body: (link: string) => { show: unknown; send: unknown },
): Promise<void> {
  const token = await requestToken(paypalCredentials());
  const { link } = await detailsWithLink(id, rel, token.accessToken);
  if (!link) {
    console.log(`FAIL LinkMissing: no "${rel}" link on ${id}; not sending`);
    return void (process.exitCode = 1);
  }
  const path = link.href.replace(SANDBOX_BASE_URL, "");
  const { show, send } = body(link.href);
  console.log(`${link.method} ${link.href}`);
  console.log(JSON.stringify(show, null, 2));
  if (!opts.send) {
    console.log("DRY RUN: not sent. Re-run with --send to send it.");
    return;
  }
  const res = await paypalRequest("POST", path, token.accessToken, send);
  console.log(
    `PASS HTTP ${res.status}${res.debugId ? ` (debug_id ${res.debugId})` : ""}`,
  );
  console.log(
    `fixture: ${saveFixture(`responses/${label}.json`, res.body ?? null)}`,
  );
  const after = await paypalGet(
    `/v1/customer/disputes/${encodeURIComponent(id)}`,
    token.accessToken,
  );
  const d = PaypalDisputeDetails.parse(after.body);
  console.log(
    `after: status=${d.status} stage=${d.dispute_life_cycle_stage ?? "-"} state=${d.dispute_state ?? "-"} links=${d.links.map((l) => l.rel).join(",")}`,
  );
  console.log(
    `after: evidences=${(d.evidences ?? []).map((e) => e.evidence_type).join(",")}`,
  );
  console.log(
    `fixture: ${saveFixture(`disputes/${id}.after-${label}.details.json`, after.body)}`,
  );
}

/** S3: provide-evidence, multipart form A (contract 2.3, Q2/Q3). Default: the $48 INR dispute. */
function s3(opts: SpikeOptions): Promise<void> {
  const carrier = opts.carrier ?? "USPS";
  const input: EvidenceInput = {
    evidences: [
      {
        evidence_type: "PROOF_OF_FULFILLMENT",
        evidence_info: {
          tracking_info: [
            {
              carrier_name: carrier,
              tracking_number: "9400111899223817565432",
            },
          ],
        },
        notes: `Shipped on 2026-10-17 with ${carrier}. Tracking 9400111899223817565432.`,
      },
    ],
  };
  const files = opts.file
    ? [{ name: "proof-of-shipment.png", type: "image/png", data: TINY_PNG }]
    : [];
  return write(
    opts,
    `provide-evidence.form-a${opts.file ? ".file" : ""}.${carrier.toLowerCase()}`,
    opts.dispute ?? "PP-R-QBT-10193246",
    "provide_evidence",
    () => ({
      show: {
        multipart: {
          input: { contentType: "application/json", json: input },
          ...Object.fromEntries(
            files.map((f, n) => [
              `file${n + 1}`,
              `${f.name} (${f.type}, ${f.data.length} bytes)`,
            ]),
          ),
        },
      },
      send: evidenceFormA(input, files),
    }),
  );
}

/** S4: accept-claim with REFUND (contract 2.4, Q5). Default: the $36 INR dispute. */
function s4(opts: SpikeOptions): Promise<void> {
  const body = {
    note: "Refunding in full: order DS-1003 was not delivered.",
    accept_claim_type: "REFUND",
  };
  return write(
    opts,
    "accept-claim.refund",
    opts.dispute ?? "PP-R-AUY-10193248",
    "accept_claim",
    () => ({ show: { json: body }, send: body }),
  );
}

// ngrok's local inspector keeps every tunnelled request byte for byte; S5 reads PayPal's deliveries from it.
const NGROK_INSPECTOR = "http://127.0.0.1:4040/api/requests/http?limit=100";
const WEBHOOK_HEADERS = [
  "paypal-transmission-id",
  "paypal-transmission-time",
  "paypal-cert-url",
  "paypal-auth-algo",
  "paypal-transmission-sig",
] as const;
const Captured = z.object({
  requests: z.array(
    z.object({
      start: z.string(),
      request: z.object({
        uri: z.string(),
        headers: z.record(z.string(), z.array(z.string())),
        raw: z.string(),
      }),
    }),
  ),
});

/**
 * S5: verify captured PayPal webhook deliveries with the postback API (contract 3), once as received and
 * once with a broken signature (Q9). Saves redacted body/header fixtures per event type.
 */
async function s5(): Promise<void> {
  const res = await fetch(NGROK_INSPECTOR).catch(() => undefined);
  if (!res?.ok)
    throw new Error(
      "ngrok inspector not reachable on :4040; is `ngrok http 4000` running?",
    );
  const deliveries = Captured.parse(await res.json()).requests.filter(
    (r) =>
      r.request.uri.startsWith("/api/webhooks/paypal") &&
      r.request.headers["Paypal-Transmission-Id"],
  );
  console.log(`${deliveries.length} PayPal webhook deliveries captured`);
  if (deliveries.length === 0) return void (process.exitCode = 1);

  const token = await requestToken(paypalCredentials());
  const webhookId = paypalWebhookId();
  const seen = new Set<string>();
  for (const d of deliveries) {
    const raw = Buffer.from(d.request.raw, "base64").toString("utf8");
    const body = raw.slice(raw.indexOf("\r\n\r\n") + 4);
    const h = Object.fromEntries(
      Object.entries(d.request.headers).map(([k, v]) => [
        k.toLowerCase(),
        v[0] ?? "",
      ]),
    );
    const event = z
      .object({ id: z.string(), event_type: z.string() })
      .loose()
      .parse(JSON.parse(body));
    if (seen.has(event.id)) continue;
    seen.add(event.id);

    const verify = async (sig: string): Promise<string> => {
      // Built by hand so webhook_event keeps the exact bytes PayPal signed.
      const J = JSON.stringify;
      const payload = `{"auth_algo":${J(h["paypal-auth-algo"])},"cert_url":${J(h["paypal-cert-url"])},"transmission_id":${J(h["paypal-transmission-id"])},"transmission_sig":${J(sig)},"transmission_time":${J(h["paypal-transmission-time"])},"webhook_id":${J(webhookId)},"webhook_event":${body}}`;
      try {
        const r = await paypalRequest(
          "POST",
          "/v1/notifications/verify-webhook-signature",
          token.accessToken,
          payload,
        );
        return `HTTP ${r.status} ${JSON.stringify(r.body)}${r.debugId ? ` (debug_id ${r.debugId})` : ""}`;
      } catch (err) {
        if (err instanceof PayPalError)
          return `${err.message}${err.debugId ? ` (debug_id ${err.debugId})` : ""}`;
        throw err;
      }
    };
    const sig = h["paypal-transmission-sig"] ?? "";
    const broken = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const slug = event.event_type.toLowerCase().replaceAll(".", "-");
    console.log(`${d.start} ${event.event_type} ${event.id}`);
    console.log(`  verify as received: ${await verify(sig)}`);
    console.log(`  verify bad sig:     ${await verify(broken)}`);
    console.log(
      `  fixture: ${saveFixture(`webhooks/${slug}.body.json`, JSON.parse(body))}`,
    );
    console.log(
      `  fixture: ${saveFixture(`webhooks/${slug}.headers.json`, Object.fromEntries(WEBHOOK_HEADERS.map((k) => [k, h[k] ?? null])))}`,
    );
  }
}

const PROTECTION: Record<string, string> = {
  "01": "Eligible",
  "02": "Not eligible",
  "03": "Partially eligible",
};

/** S6: Transaction search over the last 30 days (contract 4, gate G5). Prints codes and field presence only. */
async function s6(): Promise<void> {
  const token = await requestToken(paypalCredentials());
  const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;
  const q = new URLSearchParams({
    start_date: iso(Date.now() - 30 * 86_400_000),
    end_date: iso(Date.now()),
    fields: "transaction_info,payer_info,shipping_info,cart_info",
    page_size: "100",
  });
  const res = await paypalGet(
    `/v1/reporting/transactions?${q.toString()}`,
    token.accessToken,
  );
  const body = PaypalTransactionSearch.parse(res.body);
  console.log(
    `HTTP ${res.status}: ${body.total_items} transaction(s), ${body.total_pages} page(s), data as of ${body.last_refreshed_datetime ?? "?"}`,
  );
  for (const {
    transaction_info: t,
    shipping_info,
    cart_info,
  } of body.transaction_details) {
    const addr = Object.keys(shipping_info?.address ?? {}).join(",");
    const items = (cart_info?.item_details ?? [])
      .map((i) => i.item_name)
      .join("; ");
    console.log(
      [
        `${t.transaction_id} ${t.transaction_event_code} ${t.transaction_initiation_date} ${t.transaction_amount.value} ${t.transaction_amount.currency_code} status=${t.transaction_status}`,
        `  protection=${t.protection_eligibility ?? "-"} (${PROTECTION[t.protection_eligibility ?? ""] ?? "absent"}) ref=${t.paypal_reference_id_type ?? "-"}:${t.paypal_reference_id ?? "-"} invoice=${t.invoice_id ?? "-"}`,
        `  ship_to: ${addr || "none"}  items: ${items || "none"}`,
      ].join("\n"),
    );
  }
  console.log(
    `fixture: ${saveFixture("transactions/search.sandbox.json", res.body)}`,
  );
}

const showOrder = (o: PaypalOrder): void => {
  for (const [n, pu] of o.purchase_units.entries()) {
    const p = `purchase_units[${n}]`;
    console.log(
      [
        `  ${p}.shipping.address: ${Object.keys(pu.shipping?.address ?? {}).join(",") || "absent"}`,
        `  ${p}.payments.captures: ${(pu.payments?.captures ?? []).map((c) => `${c.id} ${c.status}`).join("; ") || "absent"}`,
        `  ${p}.payments.refunds: ${(pu.payments?.refunds ?? []).map((r) => `${r.id} ${r.status} ${r.amount?.value ?? ""}`).join("; ") || "absent"}`,
        `  ${p}.shipping.trackers: ${(pu.shipping?.trackers ?? []).map((t) => `${t.id} ${t.status}`).join("; ") || "absent"}`,
      ].join("\n"),
    );
  }
};

async function getOrder(id: string, accessToken: string) {
  const res = await paypalGet(
    `/v2/checkout/orders/${encodeURIComponent(id)}`,
    accessToken,
  );
  const o = PaypalOrder.parse(res.body);
  console.log(
    `order ${o.id}: status=${o.status} links=${o.links.map((l) => l.rel).join(",")}`,
  );
  return { o, raw: res.body };
}

/**
 * S7: without --order, creates a $24 Orders API order for the buyer to approve; with --order, captures it
 * once APPROVED (--send) and records the nested paths for captures, refunds, shipping and trackers (Q4).
 */
async function s7(opts: SpikeOptions): Promise<void> {
  const token = await requestToken(paypalCredentials());
  if (!opts.order) {
    const usd = (value: string) => ({ currency_code: "USD", value });
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "DS-1005",
          invoice_id: `DS-1005-${Date.now()}`,
          amount: { ...usd("24.00"), breakdown: { item_total: usd("24.00") } },
          items: [
            {
              name: "Speckled mug (set of 2)",
              quantity: "1",
              unit_amount: usd("24.00"),
              category: "PHYSICAL_GOODS",
            },
          ],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Hearthside Ceramics",
            shipping_preference: "GET_FROM_FILE",
            user_action: "PAY_NOW",
            return_url: "https://example.com/return",
            cancel_url: "https://example.com/cancel",
          },
        },
      },
    };
    console.log(`POST /v2/checkout/orders\n${JSON.stringify(body, null, 2)}`);
    if (!opts.send)
      return console.log("DRY RUN: not sent. Re-run with --send.");
    const res = await paypalRequest(
      "POST",
      "/v2/checkout/orders",
      token.accessToken,
      body,
    );
    const o = PaypalOrder.parse(res.body);
    console.log(`HTTP ${res.status}: order ${o.id} status=${o.status}`);
    console.log(
      `buyer approves at: ${o.links.find((l) => l.rel === "payer-action")?.href ?? "no payer-action link"}`,
    );
    console.log(`fixture: ${saveFixture("orders/created.json", res.body)}`);
    return;
  }
  let { o, raw } = await getOrder(opts.order, token.accessToken);
  if (o.status === "APPROVED") {
    const path = `/v2/checkout/orders/${encodeURIComponent(o.id)}/capture`;
    console.log(`POST ${path}`);
    if (!opts.send)
      return console.log("DRY RUN: not captured. Re-run with --send.");
    const res = await paypalRequest(
      "POST",
      path,
      token.accessToken,
      {},
      fetch,
      {
        "paypal-request-id": `ds-capture-${o.id}`,
      },
    );
    console.log(
      `HTTP ${res.status}${res.debugId ? ` (debug_id ${res.debugId})` : ""}`,
    );
    console.log(
      `fixture: ${saveFixture("responses/order-capture.json", res.body)}`,
    );
    ({ o, raw } = await getOrder(o.id, token.accessToken));
  }
  showOrder(o);
  console.log(`fixture: ${saveFixture(`orders/${o.id}.details.json`, raw)}`);
}

/**
 * S8: add a tracker to a captured order, then a $1.00 partial refund sent twice with the same
 * PayPal-Request-Id (Q6). Writes only with --send.
 */
async function s8(opts: SpikeOptions): Promise<void> {
  if (!opts.order)
    throw new Error("s8 needs --order <id> (a captured order from s7)");
  const token = await requestToken(paypalCredentials());
  const { o } = await getOrder(opts.order, token.accessToken);
  const capture = o.purchase_units[0]?.payments?.captures?.[0];
  if (!capture)
    throw new Error(`order ${o.id} has no capture yet; run s7 first`);
  const track = {
    capture_id: capture.id,
    tracking_number: "9400111899223817565499",
    carrier: opts.carrier ?? "USPS",
    notify_payer: false,
  };
  const refund = {
    amount: { currency_code: "USD", value: "1.00" },
    note_to_payer: "Partial refund for a chipped mug.",
  };
  const requestId = `ds-refund-${capture.id}-1`;
  console.log(
    `POST /v2/checkout/orders/${o.id}/track\n${JSON.stringify(track, null, 2)}`,
  );
  console.log(
    `POST /v2/payments/captures/${capture.id}/refund (PayPal-Request-Id ${requestId}) x2\n${JSON.stringify(refund, null, 2)}`,
  );
  if (!opts.send) return console.log("DRY RUN: not sent. Re-run with --send.");

  const send = async (
    label: string,
    path: string,
    body: unknown,
    headers = {},
  ) => {
    try {
      const res = await paypalRequest(
        "POST",
        path,
        token.accessToken,
        body,
        fetch,
        headers,
      );
      const b = z
        .object({ id: z.string().optional(), status: z.string().optional() })
        .loose()
        .safeParse(res.body);
      console.log(
        `${label}: HTTP ${res.status} id=${b.data?.id ?? "-"} status=${b.data?.status ?? "-"}${res.debugId ? ` (debug_id ${res.debugId})` : ""}`,
      );
      console.log(
        `  fixture: ${saveFixture(`responses/${label}.json`, res.body ?? null)}`,
      );
    } catch (err) {
      if (!(err instanceof PayPalError)) throw err;
      console.log(
        `${label}: FAIL ${err.message}${err.debugId ? ` (debug_id ${err.debugId})` : ""}`,
      );
    }
  };
  await send(
    "order-track.usps",
    `/v2/checkout/orders/${encodeURIComponent(o.id)}/track`,
    track,
  );
  const refundPath = `/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`;
  await send("capture-refund.partial", refundPath, refund, {
    "paypal-request-id": requestId,
  });
  await send("capture-refund.partial.repeat", refundPath, refund, {
    "paypal-request-id": requestId,
  });
  const after = await getOrder(o.id, token.accessToken);
  showOrder(after.o);
  console.log(
    `fixture: ${saveFixture(`orders/${o.id}.after-track-refund.details.json`, after.raw)}`,
  );
}

export const SPIKES: Record<
  "s0" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9",
  (opts: SpikeOptions) => Promise<void>
> = { s0, s1, s2, s3, s4, s5, s6, s7, s8, s9 };

export async function runSpike(
  id: keyof typeof SPIKES,
  opts: SpikeOptions = {},
): Promise<void> {
  try {
    await SPIKES[id](opts);
  } catch (err) {
    if (err instanceof PayPalError) {
      console.error(
        `FAIL ${err.name}: ${err.message}${err.debugId ? ` (debug_id ${err.debugId})` : ""}`,
      );
    } else {
      console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exitCode = 1;
  }
}
