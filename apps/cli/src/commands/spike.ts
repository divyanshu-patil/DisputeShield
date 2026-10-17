import { mkdirSync, writeFileSync } from "node:fs";
import {
  PayPalError,
  SANDBOX_BASE_URL,
  redact,
  requestToken,
} from "@ds/paypal";
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

export const SPIKES = { s0 } as const;

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
