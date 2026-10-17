import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.js";

// Source layout (packages/db/src) or a bundle that copied drizzle/ next to itself (apps/api/dist).
const MIGRATIONS = [new URL("../drizzle", import.meta.url), new URL("./drizzle", import.meta.url)]
  .map((u) => fileURLToPath(u))
  .find((p) => existsSync(p)) ?? fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies committed migrations. `schema` lets tests run in an isolated `test_<random>` schema. */
export async function runMigrations(db: Db, schema = "public"): Promise<void> {
  await migrate(db, {
    migrationsFolder: MIGRATIONS,
    migrationsSchema: schema === "public" ? "drizzle" : schema,
  });
}
