import { DEFAULT_RISK_THRESHOLDS } from "@ds/schemas";
import { describe, expect, it } from "vitest";
import {
  CaseTransitionError,
  evaluateRisk,
  nextCaseState,
  paypalEvent,
} from "../src/index.js";

describe("case state machine (AC-CASE-07)", () => {
  it("refuses_new_to_submitted", () => {
    expect(() => nextCaseState("NEW", "SUBMITTED")).toThrow(
      CaseTransitionError,
    );
  });
  it("walks_the_happy_path", () => {
    let s = nextCaseState("NEW", "COLLECT");
    s = nextCaseState(s, "COLLECTED_READY");
    s = nextCaseState(s, "APPROVE");
    s = nextCaseState(s, "SUBMITTED");
    expect(nextCaseState(s, "PAYPAL_REVIEWING")).toBe("AWAITING_OUTCOME");
  });
  it("needs_info_recollects_to_ready (AC-CASE-05)", () => {
    expect(
      nextCaseState(nextCaseState("NEEDS_INFO", "COLLECT"), "COLLECTED_READY"),
    ).toBe("READY");
  });
  it("accept_claim_allowed_from_needs_info (AC-SUB-07)", () => {
    expect(nextCaseState("NEEDS_INFO", "APPROVE_ACCEPT")).toBe("APPROVED");
    expect(() => nextCaseState("NEEDS_INFO", "APPROVE")).toThrow();
  });
  it("expires_open_cases_only (AC-CASE-08)", () => {
    expect(nextCaseState("READY", "DEADLINE_PASSED")).toBe("EXPIRED");
    expect(() => nextCaseState("SUBMITTED", "DEADLINE_PASSED")).toThrow();
  });
  it("maps_resolved_outcomes", () => {
    expect(
      paypalEvent(
        "AWAITING_OUTCOME",
        "RESOLVED",
        "RESOLVED_SELLER_FAVOUR",
        false,
      ),
    ).toBe("RESOLVED_WON");
    expect(
      paypalEvent(
        "AWAITING_OUTCOME",
        "RESOLVED",
        "RESOLVED_BUYER_FAVOUR",
        false,
      ),
    ).toBe("RESOLVED_LOST");
    expect(
      paypalEvent("READY", "RESOLVED", "RESOLVED_BUYER_FAVOUR", true),
    ).toBe("RESOLVED_ACCEPTED");
    expect(paypalEvent("SUBMITTED", "UNDER_REVIEW", undefined, false)).toBe(
      "PAYPAL_REVIEWING",
    );
  });
});

const now = new Date("2026-10-18T12:00:00Z");
const txn = (over: Partial<Parameters<typeof evaluateRisk>[0]> = {}) => ({
  id: "T1",
  occurredAt: "2026-10-15T12:00:00Z",
  amountMinor: 4800,
  currency: "USD",
  protectionEligibility: "01",
  shipToPostal: "95131",
  shipToCountry: "US",
  trackingOnPaypal: true,
  ...over,
});
const rules = (f: ReturnType<typeof evaluateRisk>) =>
  f.map((x) => x.rule).sort();

describe("risk rules", () => {
  it("prot_and_addr_for_risk001 (AC-RISK-01)", () => {
    const f = evaluateRisk(
      txn({ protectionEligibility: "02" }),
      {
        trackingNumber: "1Z",
        shippedAt: null,
        deliveredAt: null,
        lastScanAt: null,
        shipToPostal: "10001",
        shipToCountry: "US",
      },
      now,
      DEFAULT_RISK_THRESHOLDS,
    );
    expect(rules(f)).toEqual(["R-ADDR", "R-PROT"]);
    expect(f.find((x) => x.rule === "R-ADDR")?.reason).toContain("10001");
  });
  it("notrack_after_48h_not_at_47h (AC-RISK-02)", () => {
    const at = (h: number) =>
      new Date(now.getTime() - h * 3_600_000).toISOString();
    const f50 = evaluateRisk(
      txn({ trackingOnPaypal: false, occurredAt: at(50) }),
      null,
      now,
      DEFAULT_RISK_THRESHOLDS,
    );
    const f47 = evaluateRisk(
      txn({ trackingOnPaypal: false, occurredAt: at(47) }),
      null,
      now,
      DEFAULT_RISK_THRESHOLDS,
    );
    expect(f50.find((x) => x.rule === "R-NOTRACK")?.suggestedAction).toBe(
      "ADD_TRACKING",
    );
    expect(f47).toEqual([]);
  });
  it("clears_when_tracking_added (AC-RISK-03)", () => {
    expect(
      evaluateRisk(
        txn({ trackingOnPaypal: true, occurredAt: "2026-10-01T00:00:00Z" }),
        null,
        now,
        DEFAULT_RISK_THRESHOLDS,
      ),
    ).toEqual([]);
  });
  it("stuck_and_high_value_raise (AC-RISK-09)", () => {
    const f = evaluateRisk(
      txn({ amountMinor: 20_000 }),
      {
        trackingNumber: "1Z",
        shippedAt: "2026-10-01",
        deliveredAt: null,
        lastScanAt: "2026-10-05",
        shipToPostal: null,
        shipToCountry: null,
      },
      now,
      DEFAULT_RISK_THRESHOLDS,
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: "R-STUCK", severity: "HIGH" });
  });
});
