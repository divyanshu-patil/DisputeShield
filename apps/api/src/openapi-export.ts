import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMemoryDeps } from "./adapters/memory.js";
import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

// P1-13: writes docs/openapi.json from buildServer() without listening; `--check` fails when it is stale.
// Placeholder env values only shape the app; no secret is read.

const OUT = fileURLToPath(
  new URL("../../../docs/openapi.json", import.meta.url),
);

export async function openApiDocument(): Promise<string> {
  const env = loadEnv({
    NODE_ENV: "test",
    DS_DEMO_ACCESS_CODE: "openapi-export",
    DS_COOKIE_SECRET: "openapi-export-cookie-secret",
    CRON_SECRET: "openapi-export",
    DS_INLINE_WORKER: "false",
    LOG_LEVEL: "silent",
  });
  const app = await buildServer({
    env,
    deps: buildMemoryDeps(env.DS_MODE),
    logger: false,
  });
  await app.ready();
  const doc = `${JSON.stringify(app.swagger(), null, 2)}\n`;
  await app.close();
  return doc;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await openApiDocument();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      // missing file is stale
    }
    if (current !== doc) {
      console.error(
        "docs/openapi.json is stale. Run `pnpm openapi:export` and commit it.",
      );
      process.exit(1);
    }
    console.log("docs/openapi.json is up to date.");
  } else {
    writeFileSync(OUT, doc);
    console.log(`wrote ${OUT}`);
  }
}
