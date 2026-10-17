import { defineConfig, devices } from "@playwright/test";

// P4-1: replay-mode e2e. Starts its own API (:4100) and web (:3100) against E2E_DATABASE_URL, with no
// PayPal or Ollama credentials, so drafts come from the templates and results are deterministic.
// The second process.env read allowed in apps/web (harness settings, not app code).

const db =
  process.env["E2E_DATABASE_URL"] ?? "postgres://ds:ds@localhost:5432/ds_e2e";
export const ACCESS_CODE = "e2e-access-code";
const ci = !!process.env["CI"];

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // specs share one seeded database and run in file order
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /seed\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth.json" },
      dependencies: ["setup"],
      testIgnore: /seed\.setup\.ts/,
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @ds/api exec tsx src/index.ts",
      url: "http://localhost:4100/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "development",
        API_PORT: "4100",
        WEB_ORIGIN: "http://localhost:3100",
        DATABASE_URL: db,
        DS_MODE: "replay",
        DS_SUBMIT_MODE: "dry-run",
        DS_DEMO_ACCESS_CODE: ACCESS_CODE,
        DS_COOKIE_SECRET: "e2e-cookie-secret-0123456789",
        CRON_SECRET: "e2e-cron-secret",
        DS_INLINE_WORKER: "true",
        DS_WORKER_INTERVAL_SECONDS: "1",
        LOG_LEVEL: "warn",
      },
    },
    {
      // Test plan section 6: a production build, which also avoids clashing with a running `next dev`.
      command: "pnpm exec next build && pnpm exec next start -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_ORIGIN: "http://localhost:4100" },
    },
  ],
});
