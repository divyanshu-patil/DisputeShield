// PayPal error taxonomy (architecture.md section 7). Messages never contain credentials or tokens.

export class PayPalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly debugId?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthError extends PayPalError {}
export class PermissionError extends PayPalError {}
export class UpstreamError extends PayPalError {}
export class RateLimited extends PayPalError {
  constructor(
    message: string,
    debugId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message, 429, debugId);
  }
}

type ErrorBody = {
  error?: unknown;
  error_description?: unknown;
  name?: unknown;
  message?: unknown;
  debug_id?: unknown;
};

/** Maps a failed PayPal response to a typed error. Reads OAuth (`error`) and REST (`name`) error bodies. */
export function paypalErrorFrom(
  res: { status: number; headers: Headers },
  body: unknown,
): PayPalError {
  const b: ErrorBody = body && typeof body === "object" ? body : {};
  const debugId =
    res.headers.get("paypal-debug-id") ??
    (typeof b.debug_id === "string" ? b.debug_id : undefined);
  const parts = [b.error ?? b.name, b.error_description ?? b.message].filter(
    (p): p is string => typeof p === "string",
  );
  const message = `PayPal HTTP ${res.status}${parts.length > 0 ? `: ${parts.join(": ")}` : ""}`;
  if (res.status === 401) return new AuthError(message, 401, debugId);
  if (res.status === 403) return new PermissionError(message, 403, debugId);
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    return new RateLimited(
      message,
      debugId,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return new UpstreamError(message, res.status, debugId);
}
