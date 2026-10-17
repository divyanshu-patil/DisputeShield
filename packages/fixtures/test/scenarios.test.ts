import {
  PaypalDisputeDetails,
  PaypalOrder,
  PaypalTransactionDetail,
} from "@ds/schemas";
import { describe, expect, it } from "vitest";
import { buildScenarios } from "../src/index.js";

describe("scenarios", () => {
  const s = buildScenarios(new Date("2026-10-18T12:00:00Z"));
  it("parse_against_paypal_schemas (replay-check)", () => {
    for (const d of s.disputes)
      expect(PaypalDisputeDetails.safeParse(d).success).toBe(true);
    for (const t of s.transactions)
      expect(PaypalTransactionDetail.safeParse(t).success).toBe(true);
    for (const o of s.orders)
      expect(PaypalOrder.safeParse(o).success).toBe(true);
  });
  it("ds002_is_due_in_about_5_hours", () => {
    const due =
      s.disputes.find((d) => d.dispute_id === "DS-002")
        ?.seller_response_due_date ?? "";
    expect(
      (Date.parse(due) - Date.parse("2026-10-18T12:00:00Z")) / 3_600_000,
    ).toBeCloseTo(5.2, 1);
  });
  it("contains_no_real_looking_contacts", () => {
    expect(JSON.stringify(s)).not.toMatch(/@(?!example\.com)[a-z]+\.[a-z]/i);
  });
});
