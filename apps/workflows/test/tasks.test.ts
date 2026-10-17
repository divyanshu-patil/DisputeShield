import { describe, expect, it, vi } from "vitest";
import type { TaskContext } from "@renderinc/sdk/workflows";
import { RETRY, buildTasks } from "../src/tasks.js";

function fakeCtx(): TaskContext {
  const ctx: TaskContext = {
    metadata: { taskRunId: "run-1" },
    // Mimic Render: run another task's body in-process and return its result.
    run: (async (def: { func: (c: TaskContext, ...a: unknown[]) => unknown }, ...args: unknown[]) => def.func(ctx, ...args)) as TaskContext["run"],
  };
  return ctx;
}

describe("workflow tasks", () => {
  it("register under the job kind names", () => {
    const t = buildTasks({});
    expect(t.syncDisputes.name).toBe("sync_disputes");
    expect(t.syncDispute.name).toBe("sync_dispute");
    expect(t.collectCase.name).toBe("collect_case");
    expect(t.draftCase.name).toBe("draft_case");
    expect(t.scanTransactions.name).toBe("scan_transactions");
    expect(t.recordFixture.name).toBe("record_fixture");
    expect(t.processDispute.name).toBe("process_dispute");
  });

  it("run the shared job handler with the Render run id", async () => {
    const collect = vi.fn().mockResolvedValue({ caseId: "c1", state: "READY" });
    const t = buildTasks({ collect_case: collect });
    await expect(t.collectCase.func(fakeCtx(), { disputeId: "PP-D-1" })).resolves.toEqual({ caseId: "c1", state: "READY" });
    expect(collect).toHaveBeenCalledWith({ disputeId: "PP-D-1" }, { runId: "run-1" });
  });

  it("chain collect -> draft in process_dispute and never submit", async () => {
    const calls: string[] = [];
    const t = buildTasks({
      collect_case: async () => { calls.push("collect"); return { caseId: "c9", state: "READY" }; },
      draft_case: async (p) => { calls.push(`draft:${p.caseId}`); return { draftId: "d1", verifierPassed: true }; },
    });
    const out = await t.processDispute.func(fakeCtx(), "PP-D-9");
    expect(calls).toEqual(["collect", "draft:c9"]);
    expect(out).toEqual({ caseId: "c9", state: "READY", draftId: "d1", verifierPassed: true });
  });

  it("surface a missing handler instead of succeeding silently", async () => {
    const t = buildTasks({});
    await expect(t.collectCase.func(fakeCtx(), { disputeId: "x" })).rejects.toThrow(/No handler/);
  });

  it("reject bad payloads so Render retries do not loop on garbage", async () => {
    const t = buildTasks({ collect_case: vi.fn() });
    await expect(t.collectCase.func(fakeCtx(), { nope: 1 })).rejects.toThrow(/Invalid payload/);
  });

  it("use bounded retries with backoff", () => {
    expect(RETRY).toEqual({ maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 });
  });
});
