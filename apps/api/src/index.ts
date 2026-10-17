import { createDb, runMigrations } from "@ds/db";
import { buildContainer } from "./container.js";
import { EnvError, loadEnv } from "./env.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.DATABASE_URL) {
    const m = createDb(env.DATABASE_URL, { max: 1 });
    await runMigrations(m.db);
    await m.close();
  }
  const deps = buildContainer(env);
  const app = await buildServer({ env, deps });
  if (deps.close) app.addHook("onClose", deps.close);
  // Replay demo with an empty database: load the scenarios so the queue is never blank.
  if (env.DS_MODE === "replay" && deps.services && (await deps.disputes.list({ limit: 1 })).length === 0) {
    app.log.info(await deps.services.seed(), "seeded replay demo");
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
}

main().catch((err: unknown) => {
  if (err instanceof EnvError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
