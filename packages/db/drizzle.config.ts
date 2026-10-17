import { defineConfig } from "drizzle-kit";

// Generates SQL into drizzle/. Never edit a generated migration; add a new one (04 section 5).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
