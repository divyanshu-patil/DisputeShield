import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import { UnauthorizedError } from "../errors.js";
import { safeEqual } from "../plugins/auth.js";
import { z } from "zod";
import { doc, ErrorBody } from "../openapi.js";
import type { Deps } from "../ports.js";

// Backup runner for hosts that sleep when idle (called by .github/workflows/cron-tick.yml).
export function cronRoutes(app: FastifyInstance, env: Env, deps: Deps): void {
  app.post(
    "/cron/tick",
    { schema: doc({ summary: "Run due jobs now (backup for sleeping hosts)", tags: ["system"], cronSecret: true, response: { 200: z.object({ ok: z.literal(true), ran: z.number(), failed: z.number() }), 401: ErrorBody } }) },
    async (req) => {
    const provided = req.headers["x-cron-secret"];
    if (typeof provided !== "string" || !safeEqual(provided, env.CRON_SECRET)) throw new UnauthorizedError();

    await deps.jobs.enqueue({ kind: "sync_disputes", payload: {}, dedupeKey: "sync_disputes" });
    const result = await deps.jobs.runDue({ budgetMs: env.DS_TICK_BUDGET_SECONDS * 1000, now: deps.clock() });
    return { ok: true, ...result };
    },
  );
}
