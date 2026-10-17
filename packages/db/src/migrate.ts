import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.js";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies committed migrations. `schema` lets tests run in an isolated `test_<random>` schema. */
export async function runMigrations(db: Db, schema = "public"): Promise<void> {
  await migrate(db, {
    migrationsFolder: MIGRATIONS,
    migrationsSchema: schema === "public" ? "drizzle" : schema,
  });
}
