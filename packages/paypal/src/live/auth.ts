import { z } from "zod";
import { UpstreamError, paypalErrorFrom } from "../errors.js";

// Hard-coded sandbox host: there is no production URL anywhere in the code (AGENTS.md rule 1).
export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

const TokenResponse = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string(),
    expires_in: z.number().int().positive(),
    scope: z.string().default(""),
  })
  .passthrough();

export type Token = {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  scopes: string[];
  /** Untouched response body, for the recorder. Contains the token: pass it through redact() first. */
  raw: unknown;
};

/** `POST /v1/oauth2/token` with client credentials (contract section 1). Caching and refresh come in P1-5. */
export async function requestToken(
  creds: { clientId: string; clientSecret: string },
  doFetch: typeof fetch = fetch,
): Promise<Token> {
  const res = await doFetch(`${SANDBOX_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) throw paypalErrorFrom(res, body);
  const parsed = TokenResponse.safeParse(body);
  if (!parsed.success) {
    throw new UpstreamError(
      "Token response has an unexpected shape",
      res.status,
      res.headers.get("paypal-debug-id") ?? undefined,
    );
  }
  return {
    accessToken: parsed.data.access_token,
    tokenType: parsed.data.token_type,
    expiresInSeconds: parsed.data.expires_in,
    scopes: parsed.data.scope.split(" ").filter(Boolean),
    raw: body,
  };
}
