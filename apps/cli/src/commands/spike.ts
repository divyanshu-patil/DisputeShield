import { mkdirSync, writeFileSync } from "node:fs";
import {
  PayPalError,
  SANDBOX_BASE_URL,
  paypalGet,
  redact,
  requestToken,
} from "@ds/paypal";
import { z } from "zod";
import { paypalCredentials } from "../lib/env.js";

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

export const SPIKES = { s0, s1 } as const;

export async function runSpike(id: keyof typeof SPIKES): Promise<void> {
  try {
    await SPIKES[id]();
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
