import { createRepos } from "@ds/db";
import { testDb } from "@ds/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDatabaseDeps } from "../src/adapters/database.js";
import { buildMemoryDeps } from "../src/adapters/memory.js";
import { loadEnv } from "../src/env.js";
import { buildServer } from "../src/server.js";
import { TEST_ENV, login } from "./helpers.js";

// The HTTP routes over a real Postgres schema with the replay gateway (no network).
let ctx: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let cookie: string;

beforeAll(async () => {
  ctx = await testDb();
  const env = loadEnv({ ...TEST_ENV });
  const built = buildDatabaseDeps(env, buildMemoryDeps("replay"), "postgres://unused:5432/x");
  // Point the services at the isolated test schema instead of the URL above.
  const repos = createRepos(ctx.db);
  const { createPipeline, seedDemo } = await import("@ds/pipeline");
  const { ReplayGateway } = await import("@ds/paypal");
  const { buildScenarios } = await import("@ds/fixtures");
  const queued: unknown[] = [];
  const pipeline = createPipeline({ repos, gateway: new ReplayGateway(() => buildScenarios()), llm: null, model: null, submitMode: "dry-run", clock: () => new Date(), enqueue: async (j) => void queued.push(j) });
  await built.close();
  const deps = {
    ...built.deps,
    disputes: { list: (f: { caseState?: string; limit: number }) => repos.disputes.queue(f), get: async () => null },
    jobs: { enqueue: async (j: unknown) => void queued.push(j), runDue: async () => ({ ran: 0, failed: 0 }) },
    services: { pipeline, repos, queue: null, sampleCsv: () => buildScenarios().demoCsv, seed: () => seedDemo({ repos, pipeline, data: buildScenarios(), mode: "replay" }), kick: () => {} },
  };
  await deps.services.seed();
  app = await buildServer({ env, deps, logger: false });
  cookie = await login(app);
}, 30_000);
afterAll(async () => {
  await app.close();
  await ctx.drop();
});

describe("case routes over the database", () => {
  it("lists_the_seeded_queue", async () => {
    const res = await app.inject({ url: "/api/disputes", headers: { cookie } });
    expect(res.json<{ items: { id: string }[] }>().items.map((i) => i.id).sort()).toEqual(["DS-001", "DS-002", "DS-003", "DS-004"]);
  });
  it("requires_a_session (AC-API)", async () => {
    expect((await app.inject({ url: "/api/disputes/DS-001/case" })).statusCode).toBe(401);
  });
  it("approve_then_submit_dry_run_and_refuse_twice", async () => {
    const file = (await app.inject({ url: "/api/disputes/DS-001/case", headers: { cookie } })).json<{ draft: { id: string } }>();
    const bad = await app.inject({ method: "POST", url: "/api/disputes/DS-001/approve", headers: { cookie }, payload: { action: "PROVIDE_EVIDENCE", draftId: file.draft.id } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/disputes/DS-001/approve", headers: { cookie }, payload: { action: "PROVIDE_EVIDENCE", draftId: file.draft.id, confirm: true } });
    expect(ok.statusCode).toBe(200);
    const sub = await app.inject({ method: "POST", url: "/api/disputes/DS-001/submit", headers: { cookie } });
    expect(sub.json()).toMatchObject({ status: "DRY_RUN_STORED" });
    const again = await app.inject({ method: "POST", url: "/api/disputes/DS-001/submit", headers: { cookie } });
    expect(again.statusCode).toBe(409);
  });
  it("verify_mode_rejects_an_invented_value (AC-VER-12)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/disputes/DS-003/draft", headers: { cookie }, payload: { mode: "verify", draft: { evidenceType: "PROOF_OF_REFUND", statements: [{ text: "A refund of USD 99.00 was issued to the buyer.", factKeys: ["refund.amount"] }], recommendation: { action: "FIGHT", rationale: [] } } } });
    expect(res.json()).toMatchObject({ passed: false });
  });
  it("csv_errors_come_back_with_lines", async () => {
    const res = await app.inject({ method: "POST", url: "/api/fulfilment/import", headers: { cookie }, payload: { csv: "bad,header\n" } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { details: { line: number }[] } }>().error.details[0]?.line).toBe(1);
  });
  it("analytics_rejects_unknown_sources", async () => {
    expect((await app.inject({ url: "/api/analytics/users", headers: { cookie } })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/analytics/disputes", headers: { cookie } })).json<{ rows: unknown[] }>().rows.length).toBe(4);
  });
});
