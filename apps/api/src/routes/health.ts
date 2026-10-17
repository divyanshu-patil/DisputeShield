import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import { z } from "zod";
import { doc } from "../openapi.js";
import type { Deps } from "../ports.js";

const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  mode: z.enum(["live", "replay"]),
  submitMode: z.enum(["dry-run", "live"]),
  paypalEnv: z.literal("sandbox"),
  database: z.enum(["ok", "down", "not_configured"]),
  llm: z.enum(["ok", "down", "not_configured"]),
  lastSyncAt: z.string().nullable(),
  lastWebhookAt: z.string().nullable(),
  jobBackend: z.enum(["postgres", "render"]),
  inlineWorker: z.boolean(),
  now: z.string(),
});

// Public. Reports state, never secrets (no ids, keys or urls).
export function healthRoutes(app: FastifyInstance, env: Env, deps: Deps, worker: { inline: boolean }): void {
  app.get("/health", { schema: doc({ summary: "Service state (no secrets)", tags: ["system"], response: { 200: HealthResponse } }) }, async () => {
    const [database, llm, lastSync, lastWebhook] = await Promise.all([
      deps.health.database().catch(() => "down" as const),
      deps.studioLlm.status().catch(() => "down" as const),
      deps.health.lastSyncAt().catch(() => null),
      deps.events.lastReceivedAt().catch(() => null),
    ]);
    return {
      status: database === "down" ? "degraded" : "ok",
      mode: env.DS_MODE,
      submitMode: env.DS_SUBMIT_MODE,
      paypalEnv: env.PAYPAL_ENV,
      database,
      llm,
      lastSyncAt: lastSync?.toISOString() ?? null,
      lastWebhookAt: lastWebhook?.toISOString() ?? null,
      jobBackend: env.DS_JOB_BACKEND,
      inlineWorker: worker.inline,
      now: deps.clock().toISOString(),
    };
  });
}
