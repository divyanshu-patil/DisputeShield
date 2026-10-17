import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// Connection rules (architecture.md section 14, AGENTS.md rule 13): use the Supabase session pooler
// (port 5432) or the direct URL. The transaction pooler (6543) has no prepared statements, advisory
// locks or session state, which the jobs queue and migrations need, so it is refused here.

export type Db = ReturnType<typeof createDb>["db"];

export class DatabaseUrlError extends Error {
  override name = "DatabaseUrlError";
}

export function assertSessionUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseUrlError("DATABASE_URL is not a valid URL");
  }
  if (parsed.port === "6543") {
    throw new DatabaseUrlError(
      "DATABASE_URL uses the Supabase transaction pooler (port 6543). Use the session pooler (5432) or the direct URL.",
    );
  }
}

export function createDb(
  url: string,
  opts: { searchPath?: string; max?: number } = {},
) {
  assertSessionUrl(url);
  const sql = postgres(url, {
    max: opts.max ?? 5,
    onnotice: () => {},
    ...(opts.searchPath
      ? { connection: { search_path: opts.searchPath } }
      : {}),
  });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
