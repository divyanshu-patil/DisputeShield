import { describe, expect, it } from "vitest";
import {
  RUBRIC,
  assessCase,
  decide,
  deadlineBand,
  displayMoney,
  sumByCurrency,
  toDecimal,
  toMinor,
} from "../src/index.js";
import { ds001Facts } from "./helpers.js";

const now = new Date("2026-10-10T00:00:00Z");
const base = (over: Partial<Parameters<typeof decide>[0]> = {}) => {
  const a = assessCase("MERCHANDISE_OR_SERVICE_NOT_RECEIVED", ds001Facts());
  return decide({
    kind: "INR",
    strength: a.strength,
    checklist: a.checklist,
    amount: { currency: "USD", minor: 4800 },
    dueAt: "2026-10-20T00:00:00Z",
    allowedActions: ["provide_evidence", "accept_claim"],
    refundedMinor: 0,
    caseState: "READY",
    now,
    ...over,
  });
};

describe("decision aid", () => {
  it("strong_yields_fight (AC-DEC-01)", () =>
    expect(base().recommended).toBe("FIGHT"));
  it("weak_unfixable_yields_accept (AC-DEC-02)", () =>
    expect(
      base({ strength: "WEAK", dueAt: "2026-10-10T12:00:00Z" }).recommended,
    ).toBe("ACCEPT"));
  it("no_evidence_link_prevents_fight (AC-DEC-03)", () => {
    const d = base({ allowedActions: ["accept_claim"] });
    expect(d.recommended).toBe("ACCEPT");
    expect(d.because.join(" ")).toContain("no evidence link");
  });
  it.each([
    ["2026-10-10T12:00:00Z", "URGENT"],
    ["2026-10-12T00:00:00Z", "SOON"],
    ["2026-10-09T00:00:00Z", "OVERDUE"],
    ["2026-10-20T00:00:00Z", "OK"],
  ])("deadline %s is %s (AC-DEC-04)", (due, band) =>
    expect(deadlineBand(due, now)).toBe(band),
  );
  it("overdue_blocks_submit (AC-DEC-04)", () =>
    expect(
      base({ dueAt: "2026-10-09T00:00:00Z" }).blockers.join(" "),
    ).toContain("deadline has passed"));
  it("full_refund_yields_fight_with_proof_of_refund (AC-DEC-06)", () => {
    const d = base({ refundedMinor: 4800, strength: "WEAK" });
    expect(d.recommended).toBe("FIGHT");
    expect(d.evidenceType).toBe("PROOF_OF_REFUND");
  });
  it("never_uses_probability_words (AC-DEC-05)", () => {
    const text = [
      ...RUBRIC,
      ...base().because,
      ...base({ strength: "MEDIUM" }).because,
      base().costOfFighting,
    ].join(" ");
    expect(text).not.toMatch(/%|\blikely\b|\bchance\b|\bguarantee/i);
  });
});

describe("money (AC-DEC-07)", () => {
  it("round_trips_decimals_without_float_error", () => {
    for (let minor = 0; minor < 5000; minor += 7) {
      expect(toMinor(toDecimal(minor, "USD"), "USD")).toBe(minor);
    }
    expect(
      sumByCurrency([
        { currency: "USD", minor: toMinor("0.10", "USD") },
        { currency: "USD", minor: toMinor("0.20", "USD") },
      ]),
    ).toEqual([{ currency: "USD", minor: 30 }]);
    expect(displayMoney({ currency: "JPY", minor: 1200 })).toBe("JPY 1200");
  });
  it("rejects_too_many_decimals", () =>
    expect(() => toMinor("1.005", "USD")).toThrow());
});
