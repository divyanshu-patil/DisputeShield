import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./env.js";
import { startInlineWorker } from "./jobs/inline-worker.js";
import { registerOpenApi } from "./openapi.js";
import { registerPlugins } from "./plugins/index.js";
import type { Deps } from "./ports.js";
import { registerRoutes } from "./routes/index.js";

export type BuildServerOptions = {
  env: Env;
  deps: Deps;
  /** Tests pass `false` to silence logs. */
  logger?: boolean;
  /** Tests pass a stream to read the log lines (log scrubbing, 09 section 8). */
  logStream?: { write(line: string): void };
};

export async function buildServer({ env, deps, logger, logStream }: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            // Never log credentials or cookies (AGENTS.md rule 7).
            redact: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-cron-secret"]', "res.headers['set-cookie']"],
            ...(logStream ? { stream: logStream } : env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
          },
    // Honour an upstream request id, else make one. Returned in every error body.
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && incoming.length <= 100 ? incoming : randomUUID();
    },
    bodyLimit: 1024 * 1024,
    trustProxy: true, // hosts such as Render/Vercel/Fly sit behind a proxy; needed for correct client IPs
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // Route `schema` objects are documentation for OpenAPI only. Validation is done in handlers with zod,
  // so switch Fastify's own validator and response serializer off.
  app.setValidatorCompiler(() => (data: unknown) => ({ value: data }));
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  await registerPlugins(app, env);
  await registerOpenApi(app);
  await registerRoutes(app, env, deps);

  // Render Workflows runs the jobs itself, so there is nothing to poll on that backend.
  if (env.DS_INLINE_WORKER && env.DS_JOB_BACKEND === "postgres") {
    const worker = startInlineWorker({
      jobs: deps.jobs,
      intervalMs: env.DS_WORKER_INTERVAL_SECONDS * 1000,
      budgetMs: env.DS_TICK_BUDGET_SECONDS * 1000,
      clock: deps.clock,
      log: app.log,
    });
    app.addHook("onClose", async () => {
      await worker.stop();
    });
  }

  return app;
}
