import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createDb } from "../src/client.js";
import { testDatabaseUrl } from "../src/env.js";

const DIR = new URL("../drizzle/", import.meta.url);

/** A fresh `test_<random>` schema with every migration applied (04 section 5). */
export async function testDb() {
  const url = testDatabaseUrl();
  const schema = `test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  for (const file of readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const text = readFileSync(new URL(file, DIR), "utf8").replaceAll(
      '"public".',
      `"${schema}".`,
    );
    await admin.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      for (const stmt of text.split("--> statement-breakpoint"))
        if (stmt.trim()) await tx.unsafe(stmt);
    });
  }
  const { db, sql, close } = createDb(url, { searchPath: schema, max: 4 });
  return {
    db,
    sql,
    async drop() {
      await close();
      await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
