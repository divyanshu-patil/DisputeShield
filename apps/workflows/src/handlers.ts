import { createOllamaClient } from "@ds/agent";
import { createDb, createRepos } from "@ds/db";
import { buildScenarios, recordedDraft } from "@ds/fixtures";
import type { JobHandlers } from "@ds/jobs";
import { LiveGateway, ReplayGateway } from "@ds/paypal";
import { createPipeline } from "@ds/pipeline";
import { Render } from "@renderinc/sdk";
import { type WorkerEnv, workerEnv } from "./env.js";

/**
 * Composition root for the workflow service: the same @ds/pipeline handlers the API's Postgres worker
 * runs. Follow-up jobs (collect -> draft) start as new Render task runs. Without DATABASE_URL there are
 * no handlers, so tasks fail with JobNotImplementedError and Render shows it in the run history.
 */
export function buildHandlers(env: WorkerEnv | null = workerEnv()): JobHandlers {
  if (!env) return {};
  const { db } = createDb(env.databaseUrl, { max: 3 });
  const render = env.render ? new Render({ token: env.render.apiKey }) : null;
  const pipeline = createPipeline({
    repos: createRepos(db),
    gateway: env.mode === "live" && env.paypal ? new LiveGateway(env.paypal) : new ReplayGateway(() => buildScenarios()),
    llm: env.ollama ? createOllamaClient({ apiKey: env.ollama.apiKey, host: env.ollama.host, timeoutMs: 30_000 }) : null,
    model: env.ollama?.model ?? null,
    recorded: env.mode === "replay" ? recordedDraft : undefined,
    submitMode: env.submitMode,
    clock: () => new Date(),
    enqueue: async (job) => {
      if (!render || !env.render) throw new Error("RENDER_API_KEY and RENDER_WORKFLOW_SLUG are needed to chain tasks");
      await render.workflows.startTask(`${env.render.slug}/${job.kind}`, [job.payload]);
    },
    log: (msg, extra) => console.log(JSON.stringify({ msg, ...extra })),
  });
  return pipeline.handlers;
}
