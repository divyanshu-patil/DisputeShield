import { createOllamaClient } from "@ds/agent";
import { PostgresJobQueue, createDb, createRepos, runMigrations } from "@ds/db";
import { buildScenarios } from "@ds/fixtures";
import { createJobRunner } from "@ds/jobs";
import { ReplayGateway } from "@ds/paypal";
import { createPipeline, seedDemo } from "@ds/pipeline";
import { seedConfig } from "../lib/env.js";

// `pnpm seed:demo` (04 section 5): migrate, then reload the demo shop from @ds/fixtures. Idempotent.
export async function seed(opts: { force?: boolean }): Promise<void> {
  const cfg = seedConfig();
  const { db, close } = createDb(cfg.databaseUrl, { max: 3 });
  try {
    await runMigrations(db);
    const repos = createRepos(db);
    const now = new Date();
    const data = buildScenarios(now);
    let queue: PostgresJobQueue | null = null;
    const pipeline = createPipeline({
      repos,
      gateway: new ReplayGateway(() => data),
      llm: cfg.ollama
        ? createOllamaClient({
            apiKey: cfg.ollama.apiKey,
            host: cfg.ollama.host,
            timeoutMs: 30_000,
          })
        : null,
      model: cfg.ollama?.model ?? null,
      submitMode: cfg.submitMode,
      clock: () => new Date(),
      // Anything queued is left for the API's worker.
      enqueue: (j) => (queue as PostgresJobQueue).enqueue(j),
      log: (msg) => console.log(msg),
    });
    queue = new PostgresJobQueue(db, createJobRunner(pipeline.handlers));
    const r = await seedDemo({
      repos,
      pipeline,
      data,
      mode: cfg.mode,
      force: opts.force ?? false,
    });
    for (const [id, state] of Object.entries(r.cases))
      console.log(`${id}  ${state}`);
    console.log(`risk flags: ${r.flagged}`);
    if (!cfg.ollama)
      console.log(
        "OLLAMA_API_KEY/LLM_MODEL not set: drafts used the template.",
      );
  } finally {
    await close();
  }
}
