import { createDb } from "./client.js";
import { databaseUrl } from "./env.js";
import { runMigrations } from "./migrate.js";

// `pnpm db:migrate`
const url = databaseUrl();
if (!url) throw new Error("DATABASE_URL is not set");
const { db, close } = createDb(url, { max: 1 });
await runMigrations(db);
await close();
console.log("migrations applied");
