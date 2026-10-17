import { describe, expect, it, vi } from "vitest";
import { JOB_KINDS, JobNotImplementedError, JobPayloadError, createJobRunner, isJobKind } from "../src/index.js";

describe("job kinds", () => {
  it("lists every kind from the plan", () => {
    expect([...JOB_KINDS].sort()).toEqual(["collect_case", "draft_case", "record_fixture", "scan_transactions", "sync_dispute", "sync_disputes"]);
    expect(isJobKind("collect_case")).toBe(true);
    expect(isJobKind("rm_rf")).toBe(false);
  });
});

describe("createJobRunner", () => {
  it("validates, applies defaults, and calls the handler", async () => {
    const scan = vi.fn().mockResolvedValue({ flagged: 3 });
    const runner = createJobRunner({ scan_transactions: scan });
    await expect(runner.run("scan_transactions", {})).resolves.toEqual({ flagged: 3 });
    expect(scan).toHaveBeenCalledWith({ sinceDays: 7 }, {});
  });

  it("rejects payloads that do not match, before any handler runs", async () => {
    const collect = vi.fn();
    const runner = createJobRunner({ collect_case: collect });
    await expect(runner.run("collect_case", { disputeId: "" })).rejects.toBeInstanceOf(JobPayloadError);
    await expect(runner.run("collect_case", { disputeId: "PP-D-1", extra: true })).rejects.toBeInstanceOf(JobPayloadError);
    expect(collect).not.toHaveBeenCalled();
  });

  it("fails clearly when no handler is registered", async () => {
    const runner = createJobRunner({});
    expect(runner.has("draft_case")).toBe(false);
    await expect(runner.run("draft_case", { caseId: "c1" })).rejects.toBeInstanceOf(JobNotImplementedError);
  });

  it("lets handler errors propagate so the backend can retry", async () => {
    const runner = createJobRunner({ sync_disputes: async () => { throw new Error("paypal 503"); } });
    await expect(runner.run("sync_disputes", {})).rejects.toThrow("paypal 503");
  });

  it("passes the run context through", async () => {
    const h = vi.fn().mockResolvedValue({ synced: 0 });
    await createJobRunner({ sync_disputes: h }).run("sync_disputes", undefined, { runId: "r-9" });
    expect(h).toHaveBeenCalledWith({}, { runId: "r-9" });
  });
});
