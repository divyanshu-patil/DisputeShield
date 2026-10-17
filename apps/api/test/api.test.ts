import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmAuthError, LlmRateLimitError, LlmTimeoutError } from "@ds/agent";
import { buildOllamaStudioLlm } from "../src/container.js";
import { RenderJobQueue } from "../src/adapters/render-queue.js";
import { startInlineWorker } from "../src/jobs/inline-worker.js";
import { EnvError, loadEnv } from "../src/env.js";
import { PAYPAL_HEADERS_VALID, TEST_ENV, login, makeApp, webhookBody } from "./helpers.js";

describe("env", () => {
  it("requires secrets", () => {
    expect(() => loadEnv({})).toThrow(EnvError);
  });

  it("does not echo secret values in errors", () => {
    try {
      loadEnv({ ...TEST_ENV, DS_COOKIE_SECRET: "short-secret-value" });
    } catch (e) {
      expect((e as Error).message).not.toContain("short-secret-value");
    }
  });

  it("requires PayPal credentials and a database in live mode", () => {
    expect(() => loadEnv({ ...TEST_ENV, DS_MODE: "live" })).toThrow(/PAYPAL_CLIENT_ID/);
  });

  it("refuses live submit outside live mode", () => {
    expect(() => loadEnv({ ...TEST_ENV, DS_SUBMIT_MODE: "live" })).toThrow(/DS_SUBMIT_MODE/);
  });

  it("only accepts the sandbox", () => {
    expect(() => loadEnv({ ...TEST_ENV, PAYPAL_ENV: "production" })).toThrow(EnvError);
  });
});

describe("health", () => {
  it("is public and exposes no secrets", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: "ok", mode: "replay", submitMode: "dry-run", paypalEnv: "sandbox" });
    const text = res.body;
    expect(text).not.toContain(TEST_ENV.CRON_SECRET);
    expect(text).not.toContain(TEST_ENV.DS_COOKIE_SECRET);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("reports a database that is down as degraded", async () => {
    const { app } = await makeApp({}, { health: { database: async () => "down", lastSyncAt: async () => null } });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json().status).toBe("degraded");
  });
});

describe("auth and disputes", () => {
  it("rejects the wrong access code", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { code: "nope" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    expect(res.cookies).toHaveLength(0);
  });

  it("validates the login body", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks data routes without a session (AC-UI-10)", async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: "GET", url: "/api/disputes" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/disputes/DS-001" })).statusCode).toBe(401);
  });

  it("rejects a forged or tampered cookie", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/disputes", headers: { cookie: "ds_session=ok.forged" } });
    expect(res.statusCode).toBe(401);
  });

  it("serves the queue and one dispute after login", async () => {
    const { app } = await makeApp();
    const cookie = await login(app);
    const list = await app.inject({ method: "GET", url: "/api/disputes", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);
    const one = await app.inject({ method: "GET", url: "/api/disputes/DS-001", headers: { cookie } });
    expect(one.json().id).toBe("DS-001");
    const missing = await app.inject({ method: "GET", url: "/api/disputes/NOPE", headers: { cookie } });
    expect(missing.statusCode).toBe(404);
  });

  it("validates query parameters", async () => {
    const { app } = await makeApp();
    const cookie = await login(app);
    const res = await app.inject({ method: "GET", url: "/api/disputes?limit=0", headers: { cookie } });
    expect(res.statusCode).toBe(400);
  });

  it("rate limits login attempts with Retry-After (AC-API-05)", async () => {
    const { app } = await makeApp();
    let last = await app.inject({ method: "POST", url: "/api/auth/login", payload: { code: "x" } });
    for (let i = 0; i < 11; i++) {
      last = await app.inject({ method: "POST", url: "/api/auth/login", payload: { code: "x" } });
    }
    expect(last.statusCode).toBe(429);
    expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("clears the session on logout", async () => {
    const { app } = await makeApp();
    const cookie = await login(app);
    const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === "ds_session")?.value).toBe("");
  });
});

describe("webhooks", () => {
  it("stores a verified event once and enqueues a sync job (AC-WH-01)", async () => {
    const { app, events, jobs } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: webhookBody() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, duplicate: false });
    expect(events.events.size).toBe(1);
    expect(events.events.get("WH-1")?.verified).toBe(true);
    expect(jobs.queued).toEqual([
      { kind: "sync_dispute", payload: { disputeId: "PP-D-1", eventId: "WH-1" }, dedupeKey: "sync_dispute:PP-D-1" },
    ]);
  });

  it("acknowledges a duplicate without a second job (AC-WH-02)", async () => {
    const { app, events, jobs } = await makeApp();
    const send = () => app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: webhookBody() });
    await send();
    const second = await send();
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(events.events.size).toBe(1);
    expect(jobs.queued).toHaveLength(1);
  });

  it("stores but does not act on an unverified event (AC-WH-03)", async () => {
    const { app, events, jobs } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: { ...PAYPAL_HEADERS_VALID, "paypal-transmission-sig": "tampered" },
      payload: webhookBody("WH-2"),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("WEBHOOK_UNVERIFIED");
    expect(events.events.get("WH-2")?.verified).toBe(false);
    expect(jobs.queued).toHaveLength(0);
  });

  it("fails closed in live mode while the real verifier is not wired", async () => {
    const { app, jobs } = await makeApp({
      DS_MODE: "live",
      PAYPAL_CLIENT_ID: "id",
      PAYPAL_CLIENT_SECRET: "secret",
      PAYPAL_WEBHOOK_ID: "wh",
      DATABASE_URL: "postgres://x",
    });
    const res = await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: webhookBody("WH-3") });
    expect(res.statusCode).toBe(400);
    expect(jobs.queued).toHaveLength(0);
  });

  it("stores the exact bytes received (AC-WH-04)", async () => {
    const { app, events } = await makeApp();
    const body = webhookBody("WH-4");
    await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: body });
    expect(events.events.get("WH-4")?.bodyRaw).toBe(body);
  });

  it("stores only the five PayPal headers", async () => {
    const { app, events } = await makeApp();
    await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: { ...PAYPAL_HEADERS_VALID, cookie: "secret=1", authorization: "Bearer x" }, payload: webhookBody("WH-5") });
    const stored = events.events.get("WH-5")?.headers ?? {};
    expect(Object.keys(stored).sort()).toEqual([
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ]);
  });

  it("rejects a body over 1 MB with 413 and stores nothing (AC-WH-06)", async () => {
    const { app, events } = await makeApp();
    const big = JSON.stringify({ id: "WH-BIG", event_type: "X", pad: "a".repeat(1024 * 1024 + 10) });
    const res = await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: big });
    expect(res.statusCode).toBe(413);
    expect(events.events.size).toBe(0);
  });

  it("rejects bodies that are not PayPal events", async () => {
    const { app, events } = await makeApp();
    const noId = await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: '{"event_type":"X"}' });
    expect(noId.statusCode).toBe(400);
    const notJson = await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: "not json" });
    expect(notJson.statusCode).toBe(400);
    expect(events.events.size).toBe(0);
  });

  it("does not swallow verifier crashes", async () => {
    const { app, jobs } = await makeApp({}, { verifier: { verify: async () => { throw new Error("boom"); } } });
    const res = await app.inject({ method: "POST", url: "/api/webhooks/paypal", headers: PAYPAL_HEADERS_VALID, payload: webhookBody("WH-6") });
    expect(res.statusCode).toBe(400);
    expect(jobs.queued).toHaveLength(0);
  });
});

describe("cron tick", () => {
  it("requires the secret (AC-SYNC-06)", async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: "POST", url: "/api/cron/tick" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/cron/tick", headers: { "x-cron-secret": "wrong" } })).statusCode).toBe(401);
  });

  it("runs due jobs with the secret", async () => {
    const { app, jobs } = await makeApp();
    const handled: unknown[] = [];
    jobs.handlers.set("sync_disputes", async (p) => { handled.push(p); });
    const res = await app.inject({ method: "POST", url: "/api/cron/tick", headers: { "x-cron-secret": TEST_ENV.CRON_SECRET } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, ran: 1, failed: 0 });
    expect(handled).toHaveLength(1);
  });
});

describe("errors", () => {
  it("answers unknown routes with a typed 404", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("hides internals of unexpected errors and returns the request id", async () => {
    const { app } = await makeApp({}, { disputes: { list: async () => { throw new Error("secret db password leaked"); }, get: async () => null } });
    const cookie = await login(app);
    const res = await app.inject({ method: "GET", url: "/api/disputes", headers: { cookie, "x-request-id": "req-abc" } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret db password");
    expect(res.json().error).toMatchObject({ code: "INTERNAL", requestId: "req-abc" });
  });
});

describe("openapi", () => {
  it("publishes a spec generated from the zod schemas", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/openapi.json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBe("3.0.3");
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/api/health", "/api/auth/login", "/api/webhooks/paypal", "/api/cron/tick", "/api/disputes", "/api/disputes/{id}"]),
    );
    expect(spec.paths["/api/disputes"].get.security).toEqual([{ sessionCookie: [] }]);
    expect(spec.paths["/api/auth/login"].post.requestBody.content["application/json"].schema.properties.code).toBeTruthy();
    expect(spec.components.securitySchemes.cronSecret).toBeTruthy();
  });
});

describe("inline worker", () => {
  afterEach(() => vi.useRealTimers());

  it("runs jobs on an interval, never overlaps, and stops cleanly", async () => {
    vi.useFakeTimers();
    let concurrent = 0;
    let maxConcurrent = 0;
    let calls = 0;
    const jobs = {
      enqueue: async () => {},
      runDue: async () => {
        calls += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 5000));
        concurrent -= 1;
        return { ran: 1, failed: 0 };
      },
    };
    const log = { info: vi.fn(), error: vi.fn() };
    const worker = startInlineWorker({ jobs, intervalMs: 1000, budgetMs: 100, clock: () => new Date(), log });
    await vi.advanceTimersByTimeAsync(3000); // ticks fire while the first run is still in flight
    expect(calls).toBe(1);
    expect(maxConcurrent).toBe(1);
    const stopped = worker.stop();
    await vi.advanceTimersByTimeAsync(5000);
    await stopped;
    const after = calls;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(after);
  });

  it("logs failures and keeps going", async () => {
    vi.useFakeTimers();
    const jobs = { enqueue: async () => {}, runDue: vi.fn().mockRejectedValue(new Error("db down")) };
    const log = { info: vi.fn(), error: vi.fn() };
    const worker = startInlineWorker({ jobs, intervalMs: 1000, budgetMs: 100, clock: () => new Date(), log });
    await vi.advanceTimersByTimeAsync(3500);
    expect(jobs.runDue.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(log.error).toHaveBeenCalled();
    await worker.stop();
  });
});


const turnBody = { input: [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }], responseFormat: { type: "text" } };

describe("studio llm proxy", () => {
  it("requires a session", async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: "POST", url: "/api/studio/llm/turn", payload: turnBody })).statusCode).toBe(401);
  });

  it("answers honestly in replay mode with no model configured", async () => {
    const { app } = await makeApp();
    const cookie = await login(app);
    const res = await app.inject({ method: "POST", url: "/api/studio/llm/turn", headers: { cookie }, payload: turnBody });
    expect(res.statusCode).toBe(200);
    expect(res.json().output[0].content[0].text).toContain("No language model is connected");
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.json().llm).toBe("not_configured");
  });

  it("validates the request", async () => {
    const { app } = await makeApp();
    const cookie = await login(app);
    const res = await app.inject({ method: "POST", url: "/api/studio/llm/turn", headers: { cookie }, payload: { input: "nope" } });
    expect(res.statusCode).toBe(400);
  });

  it.each([
    [new LlmRateLimitError(9), 429, "RATE_LIMITED"],
    [new LlmTimeoutError(1000), 504, "LLM_TIMEOUT"],
    [new LlmAuthError(401), 502, "LLM_PROVIDER_AUTH"],
  ])("maps provider failures to clean HTTP errors", async (err, status, code) => {
    const { app } = await makeApp({}, { studioLlm: { turn: async () => { throw err; }, status: async () => "ok" } });
    const cookie = await login(app);
    const res = await app.inject({ method: "POST", url: "/api/studio/llm/turn", headers: { cookie }, payload: turnBody });
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
    if (status === 429) expect(res.headers["retry-after"]).toBe("9");
  });

  it("requires LLM_MODEL when a key is set", () => {
    expect(() => loadEnv({ ...TEST_ENV, OLLAMA_API_KEY: "k" })).toThrow(/LLM_MODEL/);
  });
});

describe("ollama status probe", () => {
  it("reports ok, then down, and caches for a minute", async () => {
    let t = 0;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const llm = buildOllamaStudioLlm("k", "https://ollama.com", "m", () => t);
    expect(await llm.status()).toBe("ok");
    expect(await llm.status()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t = 61_000;
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await llm.status()).toBe("down");
    vi.unstubAllGlobals();
  });
});

describe("render job backend", () => {
  it("requires the Render key and workflow slug", () => {
    expect(() => loadEnv({ ...TEST_ENV, DS_JOB_BACKEND: "render" })).toThrow(/RENDER_API_KEY is required/);
    expect(() => loadEnv({ ...TEST_ENV, DS_JOB_BACKEND: "render", RENDER_API_KEY: "k" })).toThrow(/RENDER_WORKFLOW_SLUG is required/);
    expect(loadEnv({ ...TEST_ENV, DS_JOB_BACKEND: "render", RENDER_API_KEY: "k", RENDER_WORKFLOW_SLUG: "ds" }).DS_JOB_BACKEND).toBe("render");
  });

  it("starts <slug>/<kind> with the payload and an idempotency key", async () => {
    const startTask = vi.fn().mockResolvedValue({ taskRunId: "trn-1" });
    const q = new RenderJobQueue({ workflowSlug: "ds", startTask, clock: () => new Date("2026-10-17T10:00:00Z") });
    await q.enqueue({ kind: "collect_case", payload: { disputeId: "PP-D-1" }, dedupeKey: "WH-9" });
    expect(startTask).toHaveBeenCalledWith("ds/collect_case", [{ disputeId: "PP-D-1" }], { idempotencyKey: "collect_case:WH-9" });
  });

  it("buckets keys by time so a later sync is not swallowed, but a quick retry is", async () => {
    const keys: string[] = [];
    let now = new Date("2026-10-17T10:00:00Z").getTime();
    const q = new RenderJobQueue({
      workflowSlug: "ds",
      startTask: async (_s, _a, o) => { keys.push(o.idempotencyKey); return {}; },
      clock: () => new Date(now),
    });
    await q.enqueue({ kind: "sync_disputes", payload: {} });
    now += 60_000;
    await q.enqueue({ kind: "sync_disputes", payload: {} });
    now += 10 * 60_000;
    await q.enqueue({ kind: "sync_disputes", payload: {} });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("reports failures to the caller and the hook", async () => {
    const onError = vi.fn();
    const q = new RenderJobQueue({ workflowSlug: "ds", startTask: async () => { throw new Error("429"); }, clock: () => new Date(), onError });
    await expect(q.enqueue({ kind: "sync_disputes", payload: {} })).rejects.toThrow("429");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("does nothing in runDue and shows the backend in /api/health", async () => {
    const q = new RenderJobQueue({ workflowSlug: "ds", startTask: vi.fn(), clock: () => new Date() });
    await expect(q.runDue()).resolves.toEqual({ ran: 0, failed: 0 });
    const { app } = await makeApp({ DS_JOB_BACKEND: "render", RENDER_API_KEY: "k", RENDER_WORKFLOW_SLUG: "ds", DS_INLINE_WORKER: "true" });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toMatchObject({ jobBackend: "render", inlineWorker: false });
  });
});
