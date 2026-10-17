import { LlmAuthError, LlmError, LlmRateLimitError, LlmTimeoutError } from "@ds/agent";
import { StudioTurnRequest } from "@ds/schemas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TooManyRequestsError, UpstreamError } from "../errors.js";
import { doc, ErrorBody } from "../openapi.js";
import type { Deps } from "../ports.js";
import { parse } from "../validate.js";

// The AG Studio chat runs in the browser (directLlmRunner) and calls this endpoint through
// packages/ui's adapter. The Ollama key never leaves the server.
export function studioLlmRoutes(app: FastifyInstance, deps: Deps): void {
  app.post(
    "/studio/llm/turn",
    {
      preHandler: app.requireSession,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: doc({
        summary: "One AG Studio agent turn, answered by the configured LLM (Ollama Cloud)",
        description: "Request and response mirror AG Studio's AgLlmRequest and AgLlmResponse (non-streaming).",
        tags: ["studio"],
        secured: true,
        body: StudioTurnRequest,
        response: { 200: z.object({ id: z.string(), status: z.string() }).loose(), 401: ErrorBody, 429: ErrorBody, 502: ErrorBody, 504: ErrorBody },
      }),
    },
    async (req) => {
      const body = parse(StudioTurnRequest, req.body);
      const ac = new AbortController();
      req.raw.on("close", () => {
        if (!req.raw.complete) ac.abort();
      });
      try {
        return await deps.studioLlm.turn(body, { signal: ac.signal });
      } catch (err) {
        if (err instanceof LlmRateLimitError) throw new TooManyRequestsError("The language model is busy, try again shortly", err.retryAfterSeconds);
        if (err instanceof LlmTimeoutError) throw new UpstreamError(504, "LLM_TIMEOUT", "The language model took too long to answer");
        if (err instanceof LlmAuthError) {
          req.log.error({ code: err.code }, "LLM provider rejected our key");
          throw new UpstreamError(502, "LLM_PROVIDER_AUTH", "The language model is not available right now");
        }
        if (err instanceof LlmError) {
          req.log.warn({ code: err.code, status: err.status }, "LLM provider error");
          throw new UpstreamError(502, err.code, "The language model could not answer");
        }
        throw err;
      }
    },
  );
}
