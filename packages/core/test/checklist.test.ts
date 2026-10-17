import { describe, expect, it } from "vitest";
import { assessCase, blockingMet } from "../src/index.js";
import { ds001Facts } from "./helpers.js";

const INR = "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";
const status = (a: ReturnType<typeof assessCase>, k: string) =>
  a.checklist.find((c) => c.key === k)?.status;

describe("INR checklist and strength", () => {
  it("strong_when_tracking_delivery_and_address_met", () => {
    const a = assessCase(INR, ds001Facts());
    expect(a.strength).toBe("STRONG");
    expect(a.checklist.every((c) => c.status === "MET")).toBe(true);
  });
  it("weak_and_blocked_without_tracking (AC-CASE-02)", () => {
    const a = assessCase(
      INR,
      ds001Facts().filter((f) => !f.key.startsWith("tracking.")),
    );
    expect(status(a, "INR-1")).toBe("MISSING");
    expect(a.strength).toBe("WEAK");
    expect(blockingMet(a.checklist)).toBe(false);
    expect(a.needsInfo[0]).toContain("Tracking number");
  });
  it("conflict_when_csv_tracking_differs (AC-CASE-04)", () => {
    const facts = [
      ...ds001Facts(),
      {
        ...ds001Facts()[0]!,
        key: "fulfil.tracking.number",
        display: "1Z999AA10000000000",
        value: "x",
        confidence: "SELLER_UPLOAD" as const,
      },
    ];
    const a = assessCase(INR, facts);
    expect(status(a, "INR-1")).toBe("CONFLICT");
    expect(a.strength).toBe("WEAK");
    expect(blockingMet(a.checklist)).toBe(false);
  });
  it("medium_when_delivery_missing", () => {
    const a = assessCase(
      INR,
      ds001Facts().filter((f) => f.key !== "fulfil.delivered_at"),
    );
    expect(a.strength).toBe("MEDIUM");
  });
  it("manual_for_unsupported_reason (AC-CASE-06)", () => {
    const a = assessCase("UNAUTHORISED", ds001Facts());
    expect(a.recommendedAction).toBe("MANUAL");
    expect(a.checklist).toEqual([]);
  });
  it("refund_case_strong_when_refund_covers_amount", () => {
    const base = ds001Facts();
    const mk = (key: string, display: string, value: string | number) => ({
      ...base[0]!,
      key,
      display,
      value,
    });
    const a = assessCase("CREDIT_NOT_PROCESSED", [
      ...base,
      mk("refund.exists", "Yes", "Yes"),
      mk("refund.amount", "USD 48.00", 4800),
      { ...base.find((f) => f.key === "dispute.amount")!, value: 4800 },
    ]);
    expect(a.strength).toBe("STRONG");
    expect(a.evidenceType).toBe("PROOF_OF_REFUND");
  });
});
