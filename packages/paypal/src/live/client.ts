import { paypalErrorFrom } from "../errors.js";
import { SANDBOX_BASE_URL } from "./auth.js";

export type RawResponse = { status: number; body: unknown; debugId?: string };

/** Authenticated GET against the sandbox. Retries, token refresh and the recorder hook come in P1-5. */
export async function paypalGet(
  path: string,
  accessToken: string,
  doFetch: typeof fetch = fetch,
): Promise<RawResponse> {
  const res = await doFetch(`${SANDBOX_BASE_URL}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) throw paypalErrorFrom(res, body);
  const debugId = res.headers.get("paypal-debug-id");
  return { status: res.status, body, ...(debugId ? { debugId } : {}) };
}
