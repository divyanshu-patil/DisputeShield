import { createJobRunner } from "@ds/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANALYTICS_VIEWS,
  DatabaseUrlError,
  PostgresJobQueue,
  assertSessionUrl,
  backoffMinutes,
  createRepos,
} from "../src/index.js";
import { testDb } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof testDb>>;
let repos: ReturnType<typeof createRepos>;
beforeAll(async () => {
  ctx = await testDb();
  repos = createRepos(ctx.db);
});
afterAll(() => ctx.drop());

const dispute = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  paypalStatus: "WAITING_FOR_SELLER_RESPONSE",
  disputeState: "REQUIRED_ACTION",
  stage: "INQUIRY",
  amountMinor: 4800,
  currency: "USD",
  disputedTransactionId: "5TY05013RG002845M",
  createdAtPaypal: "2026-10-02T00:00:00Z",
  updatedAtPaypal: "2026-10-02T00:00:00Z",
  sellerResponseDue: "2026-10-20T00:00:00Z",
  allowedActions: ["provide_evidence", "accept_claim"],
  ...over,
});

describe("connection rules (AC-DB-01)", () => {
  it("refuses_the_transaction_pooler_port", () => {
    expect(() =>
      assertSessionUrl(
        "postgres://u:p@aws-0.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow(DatabaseUrlError);
    expect(() =>
      assertSessionUrl(
        "postgres://u:p@aws-0.pooler.supabase.com:5432/postgres",
      ),
    ).not.toThrow();
  });
});

describe("repos", () => {
  it("upserts_disputes_without_duplicates (AC-SYNC-01/02)", async () => {
    const now = new Date();
    const pid = await repos.payloads.store(
      "disputes.get",
      "D-1",
      { a: 1 },
      now,
    );
    expect(
      await repos.payloads.store("disputes.get", "D-1", { a: 1 }, now),
    ).toBe(pid);
    await repos.disputes.upsert(dispute("D-1"), pid, now);
    await repos.disputes.upsert(
      dispute("D-1", { paypalStatus: "UNDER_REVIEW" }),
      pid,
      now,
    );
    await repos.cases.ensure("D-1");
    await repos.cases.ensure("D-1");
    const q = await repos.disputes.queue({ limit: 10 });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      id: "D-1",
      paypalStatus: "UNDER_REVIEW",
      caseState: "NEW",
    });
  });

  it("refuses_states_the_machine_did_not_produce (AC-CASE-07)", async () => {
    const c = await repos.cases.ensure("D-1");
    await expect(repos.cases.transition(c.id, "SUBMITTED")).rejects.toThrow(
      /cannot go from NEW/,
    );
    expect(await repos.cases.transition(c.id, "COLLECT")).toBe("COLLECTING");
  });

  it("stores_facts_snapshots_and_returns_the_latest", async () => {
    const c = await repos.cases.ensure("D-1");
    const pid = await repos.payloads.store(
      "disputes.get",
      "D-1",
      { a: 1 },
      new Date(),
    );
    const f = {
      key: "dispute.id",
      label: "Dispute ID",
      value: "D-1",
      display: "D-1",
      sourcePayloadId: pid,
      jsonPath: "dispute_id",
      fetchedAt: new Date().toISOString(),
      confidence: "PAYPAL" as const,
    };
    await repos.facts.replace(c.id, [f], new Date(Date.now() - 1000));
    await repos.facts.replace(c.id, [{ ...f, display: "D-1b" }], new Date());
    const latest = await repos.facts.latest(c.id);
    expect(latest.map((x) => x.display)).toEqual(["D-1b"]);
  });

  it("numbers_draft_versions", async () => {
    const c = await repos.cases.ensure("D-1");
    const report = {
      accepted: [],
      rejected: [],
      notesText: "",
      citationAppendix: [],
    };
    const content = {
      evidenceType: "OTHER" as const,
      statements: [],
      recommendation: { action: "REVIEW" as const, rationale: [] },
    };
    const mk = () =>
      repos.drafts.create({
        caseId: c.id,
        origin: "TEMPLATE_FALLBACK",
        model: null,
        promptVersion: null,
        content,
        report,
        passed: false,
        createdBy: "system",
      });
    const [a, b] = await Promise.all([mk(), mk()]);
    expect([a.version, b.version].sort()).toEqual([1, 2]);
  });

  it("submission_idempotency_key_returns_existing_row (AC-SUB-03)", async () => {
    const c = await repos.cases.ensure("D-1");
    const draft = await repos.drafts.latest(c.id);
    const s = {
      caseId: c.id,
      draftId: draft!.id,
      action: "PROVIDE_EVIDENCE",
      requestSnapshot: {},
      idempotencyKey: "k-1",
      approvedBy: "owner",
      approvedAt: new Date().toISOString(),
    };
    const first = await repos.submissions.create(s);
    const second = await repos.submissions.create(s);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
  });

  it("audit_log_rejects_update_and_delete (AC-NFR-08)", async () => {
    await repos.audit.append({
      actor: "system",
      action: "CASE_OPENED",
      disputeId: "D-1",
    });
    await expect(ctx.sql`UPDATE audit_log SET action = 'X'`).rejects.toThrow(
      /append-only/,
    );
    await expect(ctx.sql`DELETE FROM audit_log`).rejects.toThrow(/append-only/);
  });

  it("reconciles_risk_flags_open_update_autoclear", async () => {
    await repos.transactions.upsert({
      id: "T-1",
      occurredAt: "2026-10-10T00:00:00Z",
      amountMinor: 2400,
      currency: "USD",
      fetchedAt: new Date().toISOString(),
    });
    const finding = {
      rule: "R-NOTRACK" as const,
      severity: "HIGH" as const,
      reason: "No tracking.",
      factRefs: {},
      suggestedAction: "ADD_TRACKING" as const,
    };
    expect(await repos.risk.reconcile("T-1", [finding])).toEqual({
      opened: 1,
      cleared: 0,
    });
    expect(await repos.risk.reconcile("T-1", [finding])).toEqual({
      opened: 0,
      cleared: 0,
    });
    expect(await repos.risk.reconcile("T-1", [])).toEqual({
      opened: 0,
      cleared: 1,
    });
  });

  it("analytics_views_expose_only_the_allow_list (AC-STUDIO-01)", async () => {
    const allow: Record<string, string[]> = {
      v_analytics_disputes: [
        "id",
        "reason",
        "paypal_status",
        "case_state",
        "amount_minor",
        "currency",
        "seller_response_due",
        "hours_to_due",
        "strength",
        "verifier_passed",
      ],
      v_analytics_evidence_items: [
        "dispute_id",
        "item_key",
        "status",
        "required",
      ],
      v_analytics_statements: [
        "dispute_id",
        "accepted",
        "reject_reason",
        "fact_key_count",
      ],
      v_analytics_risk_flags: [
        "rule",
        "order_value_minor",
        "currency",
        "status",
        "created_at",
      ],
    };
    for (const view of Object.values(ANALYTICS_VIEWS)) {
      const cols =
        await ctx.sql`select column_name from information_schema.columns where table_name = ${view} and table_schema = current_schema() order by ordinal_position`;
      expect(cols.map((c) => c["column_name"])).toEqual(allow[view]);
    }
    expect((await repos.analytics.view("disputes")).length).toBeGreaterThan(0);
  });

  it("enables_rls_on_every_table (AC-DB-03)", async () => {
    const rows =
      await ctx.sql`select relname, relrowsecurity from pg_class where relnamespace = current_schema()::regnamespace and relkind = 'r'`;
    expect(rows.length).toBe(13);
    expect(rows.every((r) => r["relrowsecurity"] === true)).toBe(true);
  });
});

describe("job queue", () => {
  it("never_claims_a_job_twice (AC-SYNC-03)", async () => {
    const q = new PostgresJobQueue(ctx.db, createJobRunner({}));
    for (let i = 0; i < 20; i++)
      await q.enqueue({
        kind: "collect_case",
        payload: { disputeId: `X-${i}` },
        dedupeKey: `c:${i}`,
      });
    const now = new Date(Date.now() + 1000);
    const [a, b] = await Promise.all([q.claim(15, now), q.claim(15, now)]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("dedupes_active_jobs", async () => {
    const q = new PostgresJobQueue(ctx.db, createJobRunner({}));
    await q.enqueue({ kind: "sync_disputes", payload: {}, dedupeKey: "sync" });
    await q.enqueue({ kind: "sync_disputes", payload: {}, dedupeKey: "sync" });
    const rows =
      await ctx.sql`select count(*)::int as n from jobs where dedupe_key = 'sync'`;
    expect(rows[0]?.["n"]).toBe(1);
  });

  it("backs_off_then_dies (AC-SYNC-04)", async () => {
    await ctx.sql`delete from jobs`;
    let calls = 0;
    const q = new PostgresJobQueue(
      ctx.db,
      createJobRunner({
        draft_case: async () => {
          calls++;
          throw new Error("boom");
        },
      }),
    );
    await q.enqueue({
      kind: "draft_case",
      payload: { caseId: "c1" },
      dedupeKey: "d1",
    });
    await q.runDue({ budgetMs: 2000, now: new Date() });
    const [row] =
      await ctx.sql`select status, attempts, run_at, last_error from jobs where dedupe_key = 'd1'`;
    expect(row).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(new Date(row!["run_at"]).getTime()).toBeGreaterThan(
      Date.now() + 60_000,
    );
    expect(String(row!["last_error"])).toContain("boom");
    expect([1, 2, 3, 4, 5, 6].map(backoffMinutes)).toEqual([
      2, 4, 8, 16, 30, 30,
    ]);
    await ctx.sql`update jobs set attempts = max_attempts - 1, run_at = now() - interval '1 second' where dedupe_key = 'd1'`;
    await q.runDue({ budgetMs: 2000, now: new Date() });
    const [dead] =
      await ctx.sql`select status from jobs where dedupe_key = 'd1'`;
    expect(dead?.["status"]).toBe("DEAD");
    expect(calls).toBe(2);
  });

  it("honours_retry_after (AC-SYNC-09)", async () => {
    const err = Object.assign(new Error("429"), { retryAfterSeconds: 7 });
    const q = new PostgresJobQueue(
      ctx.db,
      createJobRunner({
        draft_case: async () => {
          throw err;
        },
      }),
    );
    await q.enqueue({
      kind: "draft_case",
      payload: { caseId: "c2" },
      dedupeKey: "d2",
    });
    await q.runDue({ budgetMs: 2000, now: new Date() });
    const [row] =
      await ctx.sql`select extract(epoch from (run_at - now()))::int as s from jobs where dedupe_key = 'd2'`;
    expect(Number(row?.["s"])).toBeGreaterThanOrEqual(5);
    expect(Number(row?.["s"])).toBeLessThanOrEqual(8);
  });

  it("reaps_stale_running_jobs (AC-SYNC-05)", async () => {
    const q = new PostgresJobQueue(ctx.db, createJobRunner({}));
    await q.enqueue({
      kind: "sync_dispute",
      payload: { disputeId: "R" },
      dedupeKey: "r1",
    });
    await ctx.sql`update jobs set status = 'RUNNING', locked_at = now() - interval '11 minutes' where dedupe_key = 'r1'`;
    expect(await q.reap(new Date())).toBe(1);
    const [row] =
      await ctx.sql`select status from jobs where dedupe_key = 'r1'`;
    expect(row?.["status"]).toBe("QUEUED");
  });
});
