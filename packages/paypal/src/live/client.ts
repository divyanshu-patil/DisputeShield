import { paypalErrorFrom } from "../errors.js";
import { SANDBOX_BASE_URL } from "./auth.js";

export type RawResponse = { status: number; body: unknown; debugId?: string };

/**
 * Authenticated call against the sandbox. A FormData body is sent as multipart (fetch sets the boundary);
 * a string is sent as-is as JSON; any other body is JSON-serialised. `extraHeaders` carries `PayPal-Request-Id`
 * (S8). Retries, token refresh and the recorder come in P1-5.
 */
export async function paypalRequest(
  method: "GET" | "POST",
  path: string,
  accessToken: string,
  body?: unknown,
  doFetch: typeof fetch = fetch,
  extraHeaders: Record<string, string> = {},
): Promise<RawResponse> {
  const headers: Record<string, string> = {
    ...extraHeaders,
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  };
  let payload: FormData | string | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    // A string is pre-serialised JSON, sent byte for byte (webhook verification embeds the raw event).
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await doFetch(`${SANDBOX_BASE_URL}${path}`, {
    method,
    headers,
    ...(payload ? { body: payload } : {}),
  });
  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : undefined;
  if (!res.ok) throw paypalErrorFrom(res, parsed);
  const debugId = res.headers.get("paypal-debug-id");
  return { status: res.status, body: parsed, ...(debugId ? { debugId } : {}) };
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const paypalGet = (
  path: string,
  accessToken: string,
  doFetch: typeof fetch = fetch,
): Promise<RawResponse> =>
  paypalRequest("GET", path, accessToken, undefined, doFetch);
