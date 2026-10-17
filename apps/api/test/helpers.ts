import type { FastifyInstance } from "fastify";
import { MemoryEventStore, MemoryJobQueue, buildMemoryDeps } from "../src/adapters/memory.js";
import { loadEnv, type Env } from "../src/env.js";
import type { Deps } from "../src/ports.js";
import { buildServer } from "../src/server.js";

export const TEST_ENV = {
  NODE_ENV: "test",
  DS_DEMO_ACCESS_CODE: "open-sesame",
  DS_COOKIE_SECRET: "test-cookie-secret-123456",
  CRON_SECRET: "test-cron-secret",
  DS_INLINE_WORKER: "false",
  LOG_LEVEL: "silent",
};

export async function makeApp(overrides: Record<string, string> = {}, depsOverride?: Partial<Deps>) {
  const env: Env = loadEnv({ ...TEST_ENV, ...overrides });
  const base = buildMemoryDeps(env.DS_MODE);
  const deps: Deps = { ...base, ...depsOverride };
  const app: FastifyInstance = await buildServer({ env, deps, logger: false });
  return {
    app,
    env,
    deps,
    events: deps.events as MemoryEventStore,
    jobs: deps.jobs as MemoryJobQueue,
  };
}

export async function login(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { code: TEST_ENV.DS_DEMO_ACCESS_CODE } });
  const cookie = res.cookies.find((c) => c.name === "ds_session");
  if (!cookie) throw new Error("login did not set a session cookie");
  return `${cookie.name}=${cookie.value}`;
}

export const PAYPAL_HEADERS_VALID = {
  "paypal-transmission-id": "tid-1",
  "paypal-transmission-time": "2026-10-17T10:00:00Z",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-sig": "fixture-valid",
  "content-type": "application/json",
};

export function webhookBody(eventId = "WH-1", disputeId = "PP-D-1"): string {
  // Deliberately oddly spaced so tests can prove the raw bytes are stored untouched.
  return `{  "id":"${eventId}",  "event_type":"CUSTOMER.DISPUTE.CREATED", "resource":{"dispute_id":"${disputeId}"}  }`;
}
