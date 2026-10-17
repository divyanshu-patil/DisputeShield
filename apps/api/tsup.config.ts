import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

// Internal @ds/* packages are consumed as TypeScript source (ADR-002), so they are
// bundled into the output. Everything else stays an external runtime dependency.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  noExternal: [/^@ds\//],
  // Migrations run at startup from dist/drizzle (packages/db/src/migrate.ts).
  onSuccess: async () => cpSync("../../packages/db/drizzle", "dist/drizzle", { recursive: true }),
});
