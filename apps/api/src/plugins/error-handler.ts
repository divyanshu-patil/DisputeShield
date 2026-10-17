import type { FastifyInstance } from "fastify";
import { AppError, TooManyRequestsError } from "../errors.js";

type ErrorBody = { error: { code: string; message: string; requestId: string; details?: unknown } };

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((req, reply) => {
    const body: ErrorBody = { error: { code: "NOT_FOUND", message: "Route not found", requestId: req.id } };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      if (err instanceof TooManyRequestsError && err.retryAfterSeconds) reply.header("retry-after", String(err.retryAfterSeconds));
      const body: ErrorBody = {
        error: { code: err.code, message: err.message, requestId: req.id, ...(err.details ? { details: err.details } : {}) },
      };
      return reply.code(err.statusCode).send(body);
    }

    // Errors raised by Fastify and its plugins (body too large, rate limit, bad JSON...) carry a statusCode.
    const maybe = err as { statusCode?: number; code?: string; message?: string };
    if (typeof maybe.statusCode === "number" && maybe.statusCode >= 400 && maybe.statusCode < 500) {
      const body: ErrorBody = {
        error: {
          code: maybe.code ?? "BAD_REQUEST",
          message: maybe.statusCode === 429 ? "Too many requests" : (maybe.message ?? "Bad request"),
          requestId: req.id,
        },
      };
      return reply.code(maybe.statusCode).send(body);
    }

    // Anything else is a bug or an upstream failure. Log detail, answer generically.
    req.log.error({ err }, "unhandled error");
    const body: ErrorBody = {
      error: { code: "INTERNAL", message: "Something went wrong", requestId: req.id },
    };
    return reply.code(500).send(body);
  });
}
