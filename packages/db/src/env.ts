import { existsSync } from "node:fs";

// The only file in @ds/db that reads process.env (AGENTS.md rule 7). Used by the CLI entry points and
// tests; the apps pass DATABASE_URL in from their own env loaders.

const ROOT_ENV = new URL("../../../.env", import.meta.url);

function load(key: string): string | undefined {
  if (process.env[key] === undefined && existsSync(ROOT_ENV))
    process.loadEnvFile(ROOT_ENV);
  return process.env[key] || undefined;
}

export const databaseUrl = (): string | undefined => load("DATABASE_URL");
export const testDatabaseUrl = (): string =>
  load("DATABASE_URL_TEST") ?? "postgres://ds:ds@localhost:5432/ds_test";
