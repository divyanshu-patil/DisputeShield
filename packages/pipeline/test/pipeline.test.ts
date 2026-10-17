import { createRepos } from "@ds/db";
import { testDb } from "@ds/db/testing";
import { buildScenarios } from "@ds/fixtures";
import { ReplayGateway } from "@ds/paypal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPipeline, parseFulfilmentCsv, seedDemo } from "../src/index.js";

let ctx: Awaited<ReturnType<typeof testDb>>;
const now = new Date();
const data = buildScenarios(now);
const queued: { kind: string; payload: Record<string, unknown> }[] = [];
let p: ReturnType<typeof createPipeline>;
let repos: ReturnType<typeof createRepos>;
let seeded: Awaited<ReturnType<typeof seedDemo>>;

beforeAll(async () => {
  ctx = await testDb();
  repos = createRepos(ctx.db);
  p = createPipeline({
    repos,
    gateway: new ReplayGateway(() => data),
    llm: null,
    model: null,
    submitMode: "dry-run",
    clock: () => new Date(),
    enqueue: async (j) => void queued.push(j),
  });
  seeded = await seedDemo({ repos, pipeline: p, data, mode: "replay" });
}, 30_000);
afterAll(() => ctx.drop());

describe("demo scenarios through the pipeline", () => {
  it("collects_each_scenario_to_its_expected_state (AC-CASE-01/02/06)", async () => {
    expect(seeded.cases).toEqual({
      "DS-001": "READY",
      "DS-002": "NEEDS_INFO",
      "DS-003": "READY",
      "DS-004": "READY",
    });
    const ds1 = await p.caseFile("DS-001");
    expect(ds1.strength).toBe("STRONG");
    expect(ds1.facts.every((f) => f.sourcePayloadId && f.jsonPath)).toBe(true);
    expect(ds1.draft?.passed).toBe(true);
    expect(ds1.decision.recommended).toBe("FIGHT");
    const ds2 = await p.caseFile("DS-002");
    expect(ds2.strength).toBe("WEAK");
    expect(ds2.checklist.find((c) => c.key === "INR-1")?.status).toBe(
      "MISSING",
    );
    const ds3 = await p.caseFile("DS-003");
    expect(ds3.evidenceType).toBe("PROOF_OF_REFUND");
    expect(ds3.draft?.passed).toBe(true);
    const ds4 = await p.caseFile("DS-004");
    expect(ds4.decision.recommended).toBe("REVIEW");
    expect(ds4.draft).toBeNull();
  });

  it("flags_risk_scenarios (AC-RISK-01/02)", async () => {
    const flags = await p.listFlags("OPEN");
    const by = (txn: string) =>
      flags
        .filter((f) => f.transactionId === txn)
        .map((f) => f.rule)
        .sort();
    expect(by("6HC90413WD527718A")).toEqual(["R-ADDR", "R-PROT"]);
    expect(by("9GS37756XK118843E")).toEqual(["R-NOTRACK"]);
  });

  it("approves_and_stores_a_dry_run (AC-SUB-02/10)", async () => {
    const file = await p.caseFile("DS-001");
    await p.approve("DS-001", {
      action: "PROVIDE_EVIDENCE",
      draftId: file.draft?.id ?? "",
    });
    expect(await p.submit("DS-001")).toMatchObject({
      status: "DRY_RUN_STORED",
    });
    const after = await p.caseFile("DS-001");
    expect(after.case?.state).toBe("SUBMITTED");
    const snap = after.submissions[0]?.requestSnapshot as {
      input: { evidences: { evidence_info: unknown }[] };
    };
    expect(snap.input.evidences[0]?.evidence_info).toEqual({
      tracking_info: [
        { carrier_name: "UPS", tracking_number: "1Z999AA10123456784" },
      ],
    });
    const audit = await repos.audit.list({ disputeId: "DS-001" });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["APPROVED", "DRY_RUN_STORED"]),
    );
    await expect(p.submit("DS-001")).rejects.toThrow(/SUBMITTED/);
  });

  it("csv_import_moves_ds002_to_ready (AC-CASE-05)", async () => {
    await p.importFulfilment(data.demoCsv);
    await p.recollect("DS-002");
    expect(queued.at(-1)).toMatchObject({
      kind: "collect_case",
      payload: { disputeId: "DS-002" },
    });
    expect((await p.collectCase("DS-002")).state).toBe("READY");
    expect((await p.caseFile("DS-002")).strength).toBe("STRONG");
  });

  it("accept_claim_and_add_tracking_dry_run (AC-SUB-07, AC-RISK-04)", async () => {
    await p.approve("DS-004", { action: "ACCEPT_CLAIM" });
    expect((await p.submit("DS-004")).status).toBe("DRY_RUN_STORED");
    const flag = (await p.listFlags("OPEN")).find(
      (f) => f.rule === "R-NOTRACK" && f.transactionId === "9GS37756XK118843E",
    );
    expect(
      await p.flagAction(flag?.id ?? "", {
        action: "ADD_TRACKING",
        trackingNumber: "9400111899223817565499",
        carrier: "USPS",
      }),
    ).toEqual({ status: "DRY_RUN_STORED" });
    expect((await p.listFlags("OPEN")).some((f) => f.id === flag?.id)).toBe(
      false,
    );
  });

  it("rejects_bad_csv_with_line_numbers", () => {
    const r = parseFulfilmentCsv(
      `${data.demoCsv.split("\n")[0]}\nHC-1,BAD ID!,UPS,1Z,2026-13-40,,,,,,,US\n`,
    );
    expect(r.errors.map((e) => e.column)).toEqual(
      expect.arrayContaining(["paypal_transaction_id", "shipped_at"]),
    );
  });
});
