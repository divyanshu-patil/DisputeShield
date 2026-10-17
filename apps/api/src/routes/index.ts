import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import type { Deps } from "../ports.js";
import { authRoutes } from "./auth.js";
import { caseRoutes } from "./cases.js";
import { cronRoutes } from "./cron.js";
import { disputeRoutes } from "./disputes.js";
import { healthRoutes } from "./health.js";
import { opsRoutes } from "./ops.js";
import { studioLlmRoutes } from "./studio-llm.js";
import { webhookRoutes } from "./webhooks.js";

export async function registerRoutes(app: FastifyInstance, env: Env, deps: Deps): Promise<void> {
  await app.register(
    async (api) => {
      healthRoutes(api, env, deps, { inline: env.DS_INLINE_WORKER && env.DS_JOB_BACKEND === "postgres" });
      authRoutes(api, env);
      webhookRoutes(api, env, deps);
      cronRoutes(api, env, deps);
      disputeRoutes(api, deps);
      caseRoutes(api, deps);
      opsRoutes(api, env, deps);
      studioLlmRoutes(api, deps);
    },
    { prefix: "/api" },
  );
}
