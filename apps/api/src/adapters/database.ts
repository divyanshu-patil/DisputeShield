import { type LlmClient, createOllamaClient } from "@ds/agent";
import { PostgresJobQueue, createDb, createRepos } from "@ds/db";
import { buildScenarios, recordedDraft } from "@ds/fixtures";
import { createJobRunner } from "@ds/jobs";
import { LiveGateway, ReplayGateway } from "@ds/paypal";
import { createPipeline, seedDemo } from "@ds/pipeline";
import type { Env } from "../env.js";
import type { Deps, Services } from "../ports.js";

// Real adapters for the ports, used when DATABASE_URL is set (P1-3, P1-4, P1-7, P2-8).

export function buildDatabaseDeps(env: Env, base: Deps, url: string, log: (msg: string, extra?: Record<string, unknown>) => void = () => {}): { deps: Deps; close: () => Promise<void> } {
  const { db, close } = createDb(url, { max: 8 });
  const repos = createRepos(db);
  const clock = base.clock;
  const gateway =
    env.DS_MODE === "live" && env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET
      ? new LiveGateway({ clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET })
      : new ReplayGateway(() => buildScenarios(clock()), clock);
  const llm: LlmClient | null = env.OLLAMA_API_KEY ? createOllamaClient({ apiKey: env.OLLAMA_API_KEY, host: env.OLLAMA_HOST, timeoutMs: 30_000 }) : null;

  let jobs = base.jobs;
  let queue: PostgresJobQueue | null = null;
  const pipeline = createPipeline({
    repos,
    gateway,
    llm,
    model: env.LLM_MODEL ?? null,
    recorded: env.DS_MODE === "replay" ? recordedDraft : undefined,
    submitMode: env.DS_SUBMIT_MODE,
    clock,
    enqueue: (j) => jobs.enqueue(j),
    log,
  });
  if (env.DS_JOB_BACKEND === "postgres") {
    queue = new PostgresJobQueue(db, createJobRunner(pipeline.handlers), log);
    jobs = queue;
  }

  // ponytail: one kick at a time; the worker interval still catches anything this misses.
  let kicking = false;
  const kick = () => {
    if (!queue || kicking) return;
    kicking = true;
    setTimeout(() => {
      void queue
        ?.runDue({ budgetMs: env.DS_TICK_BUDGET_SECONDS * 1000, now: clock() })
        .catch((err: unknown) => log("kick failed", { error: String(err) }))
        .finally(() => {
          kicking = false;
        });
    }, 50);
  };

  const services: Services = {
    pipeline,
    repos,
    queue,
    sampleCsv: () => buildScenarios(clock()).demoCsv,
    seed: () => seedDemo({ repos, pipeline, data: buildScenarios(clock()), mode: env.DS_MODE }),
    kick,
  };

  const verifier =
    gateway.mode === "live"
      ? {
          verify: ({ headers, rawBody }: { headers: Record<string, string>; rawBody: string }) =>
            env.PAYPAL_WEBHOOK_ID ? gateway.verifyWebhook(headers, rawBody, env.PAYPAL_WEBHOOK_ID) : Promise.resolve({ ok: false, detail: "PAYPAL_WEBHOOK_ID not set" }),
        }
      : base.verifier;

  const deps: Deps = {
    ...base,
    events: {
      insert: (e) => repos.events.insert(e),
      lastReceivedAt: () => repos.events.lastReceivedAt(),
    },
    verifier,
    jobs: {
      enqueue: async (j) => {
        await jobs.enqueue(j);
        kick();
      },
      runDue: (o) => jobs.runDue(o),
    },
    disputes: {
      list: (f) => repos.disputes.queue(f),
      get: async (id) => (await repos.disputes.queue({ limit: 500 })).find((r) => r.id === id) ?? null,
    },
    health: {
      database: async () => ((await repos.health.ping()) ? "ok" : "down"),
      lastSyncAt: () => repos.disputes.lastSyncAt(),
    },
    services,
  };
  return { deps, close };
}
