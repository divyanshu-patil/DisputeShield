import { type JobHandlers, type JobRunner, createJobRunner } from "@ds/jobs";
import { task, type TaskContext } from "@renderinc/sdk/workflows";

// Render Workflows tasks for Dispute Shield ✅ (SDK 1.2.0, docs read 2026-10-17).
// Each background job kind is one task, so Render supplies the retries, per-run compute and run history.
// `processDispute` chains collect -> draft with ctx.run, so each step runs on its own instance and a failed
// draft retries without redoing the (rate-limited) PayPal collection.

export const RETRY = { maxRetries: 3, waitDurationMs: 2_000, backoffScaling: 2 } as const;

export type TaskSet = ReturnType<typeof defineTasks>;

/** The runner is injected so tests and the real entry point can supply different handlers. */
export function defineTasks(runner: JobRunner) {
  const run = <K extends Parameters<JobRunner["run"]>[0]>(kind: K, ctx: TaskContext, payload: unknown) =>
    runner.run(kind, payload, ctx.metadata.taskRunId ? { runId: ctx.metadata.taskRunId } : {});

  const syncDisputes = task({ name: "sync_disputes", retry: RETRY, timeoutSeconds: 300 }, async function sync_disputes(ctx: TaskContext, payload: unknown = {}) {
    return run("sync_disputes", ctx, payload);
  });

  const syncDispute = task({ name: "sync_dispute", retry: RETRY, timeoutSeconds: 300 }, async function sync_dispute(ctx: TaskContext, payload: unknown) {
    return run("sync_dispute", ctx, payload);
  });

  const collectCase = task({ name: "collect_case", retry: RETRY, timeoutSeconds: 600 }, async function collect_case(ctx: TaskContext, payload: unknown) {
    return run("collect_case", ctx, payload);
  });

  // The LLM call: longer timeout, same retry. If the model is down the handler falls back to the
  // template (see 05-evidence-engine-spec.md section 4.4), so a retry only happens on real errors.
  const draftCase = task({ name: "draft_case", retry: RETRY, timeoutSeconds: 900 }, async function draft_case(ctx: TaskContext, payload: unknown) {
    return run("draft_case", ctx, payload);
  });

  const scanTransactions = task({ name: "scan_transactions", retry: RETRY, timeoutSeconds: 900 }, async function scan_transactions(ctx: TaskContext, payload: unknown = {}) {
    return run("scan_transactions", ctx, payload);
  });

  const recordFixture = task({ name: "record_fixture", retry: { ...RETRY, maxRetries: 0 }, timeoutSeconds: 300 }, async function record_fixture(ctx: TaskContext, payload: unknown) {
    return run("record_fixture", ctx, payload);
  });

  /** The agent pipeline for one dispute: collect facts, then draft and verify evidence. Never submits. */
  const processDispute = task({ name: "process_dispute", timeoutSeconds: 3_600 }, async function process_dispute(ctx: TaskContext, disputeId: string) {
    const collected = await ctx.run(collectCase, { disputeId });
    const drafted = await ctx.run(draftCase, { caseId: collected.caseId });
    return { caseId: collected.caseId, state: collected.state, draftId: drafted.draftId, verifierPassed: drafted.verifierPassed };
  });

  return { syncDisputes, syncDispute, collectCase, draftCase, scanTransactions, recordFixture, processDispute };
}

export function buildTasks(handlers: JobHandlers) {
  return defineTasks(createJobRunner(handlers));
}
