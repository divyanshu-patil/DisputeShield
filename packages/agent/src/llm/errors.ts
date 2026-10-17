// Typed LLM errors. Messages never contain the API key or prompt text.

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class LlmAuthError extends LlmError {
  constructor(status: number) {
    super("The LLM provider rejected the API key", "LLM_AUTH", status);
  }
}
export class LlmRateLimitError extends LlmError {
  constructor(public readonly retryAfterSeconds?: number) {
    super("The LLM provider is rate limiting requests", "LLM_RATE_LIMIT", 429);
  }
}
export class LlmTimeoutError extends LlmError {
  constructor(timeoutMs: number) {
    super(`The LLM did not answer within ${timeoutMs} ms`, "LLM_TIMEOUT");
  }
}
export class LlmUpstreamError extends LlmError {
  constructor(status: number, detail: string) {
    super(`The LLM provider returned HTTP ${status}${detail ? `: ${detail}` : ""}`, "LLM_UPSTREAM", status);
  }
}
export class LlmBadResponseError extends LlmError {
  constructor(detail: string) {
    super(`The LLM answer could not be understood: ${detail}`, "LLM_BAD_RESPONSE");
  }
}
