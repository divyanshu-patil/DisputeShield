import { buildContainer } from "./container.js";
import { EnvError, loadEnv } from "./env.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer({ env, deps: buildContainer(env) });

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
