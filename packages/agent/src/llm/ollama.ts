import { z } from "zod";
import {
  LlmAuthError,
  LlmBadResponseError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmUpstreamError,
} from "./errors.js";
import {
  OllamaChatResponseSchema,
  type LlmClient,
  type OllamaChatRequest,
} from "./types.js";

export type OllamaClientOptions = {
  /** Required for Ollama Cloud. Omit only for a local Ollama daemon. */
  apiKey?: string;
  /** Defaults to Ollama Cloud. Use http://localhost:11434 for a local daemon. */
  host?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

const TagsSchema = z.object({
  models: z
    .array(
      z.object({ name: z.string().optional(), model: z.string().optional() }),
    )
    .default([]),
});

export const OLLAMA_CLOUD_HOST = "https://ollama.com";

/**
 * Minimal client for Ollama's native API: POST {host}/api/chat and GET {host}/api/tags ✅ documented.
 * Auth is `Authorization: Bearer <key>` ✅. Plain fetch, no SDK, so it runs on any Node 20+ host.
 */
export function createOllamaClient(
  options: OllamaClientOptions = {},
): LlmClient {
  const host = (options.host ?? OLLAMA_CLOUD_HOST).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 60_000;
  const doFetch = options.fetch ?? fetch;

  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
  });

  async function call(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const onCallerAbort = () => timeout.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      const res = await doFetch(`${host}${path}`, {
        ...init,
        signal: timeout.signal,
      });
      if (res.status === 401 || res.status === 403)
        throw new LlmAuthError(res.status);
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        throw new LlmRateLimitError(
          Number.isFinite(retry) && retry > 0 ? retry : undefined,
        );
      }
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 300);
        throw new LlmUpstreamError(res.status, text);
      }
      return res;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (signal?.aborted) throw err; // the caller cancelled
        throw new LlmTimeoutError(timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  return {
    async chat(request: OllamaChatRequest, opts) {
      // Always non-streaming. `format` is passed through only if the caller set it.
      const body = JSON.stringify({ ...request, stream: false });
      const res = await call(
        "/api/chat",
        { method: "POST", headers: headers(), body },
        opts?.signal,
      );
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new LlmBadResponseError("body is not JSON");
      }
      const parsed = OllamaChatResponseSchema.safeParse(json);
      if (!parsed.success)
        throw new LlmBadResponseError("unexpected response shape");
      return parsed.data;
    },

    async listModels(opts) {
      const res = await call(
        "/api/tags",
        { method: "GET", headers: headers() },
        opts?.signal,
      );
      const parsed = TagsSchema.safeParse(await res.json().catch(() => ({})));
      if (!parsed.success)
        throw new LlmBadResponseError("unexpected tags shape");
      return parsed.data.models
        .map((m) => m.name ?? m.model ?? "")
        .filter(Boolean);
    },
  };
}
