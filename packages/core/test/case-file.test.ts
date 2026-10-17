import { buildScenarios } from "@ds/fixtures";
import type { FulfilmentRecord } from "@ds/schemas";
import { describe, expect, it } from "vitest";
import { type CaseFileInput, buildCaseFile } from "../src/index.js";

// The extractors end to end on the demo fixtures, assembled the way the pipeline does (collectCase).
const data = buildScenarios(new Date("2026-10-12T12:00:00Z"));
const at = "2026-10-12T12:00:00Z";

function input(id: string, fulfil = true): CaseFileInput {
  const d = data.disputes.find((x) => x.dispute_id === id);
  if (!d) throw new Error(id);
  const txnId = d.disputed_transactions[0]?.seller_transaction_id;
  const row = data.transactions.find(
    (t) => t.transaction_info.transaction_id === txnId,
  );
  const info = row?.transaction_info;
  const order =
    info?.paypal_reference_id_type === "ODR"
      ? data.orders.find((o) => o.id === info.paypal_reference_id)
      : undefined;
  const capture = order?.purchase_units[0]?.payments?.captures?.[0]?.id;
  const f = fulfil
    ? data.fulfilment.find((x) => x.paypal_transaction_id === txnId)
    : undefined;
  const rec: FulfilmentRecord | undefined = f && {
    orderRef: f.order_ref,
    paypalTransactionId: f.paypal_transaction_id,
    carrier: f.carrier || null,
    trackingNumber: f.tracking_number || null,
    shippedAt: f.shipped_at || null,
    deliveredAt: f.delivered_at || null,
    lastScanAt: f.last_scan_at || null,
    shipToPostal: f.ship_to_postal || null,
    shipToCountry: f.ship_to_country || null,
  };
  return {
    dispute: { body: d, payloadId: "p-d", fetchedAt: at },
    ...(row
      ? { transaction: { body: row, payloadId: "p-t", fetchedAt: at } }
      : {}),
    ...(order
      ? {
          order: { body: order, payloadId: "p-o", fetchedAt: at },
          trackers: (order.purchase_units[0]?.shipping?.trackers ?? []).map(
            (t) => ({
              body: {
                id: t.id,
                ...(capture ? { transaction_id: capture } : {}),
              },
              payloadId: "p-o",
              fetchedAt: at,
            }),
          ),
        }
      : {}),
    ...(rec
      ? { fulfilment: { body: rec, payloadId: "p-f", fetchedAt: at } }
      : {}),
  };
}

const keys = (id: string, fulfil = true) =>
  buildCaseFile(input(id, fulfil))
    .map((f) => f.key)
    .sort();
const byKey = (id: string) =>
  new Map(buildCaseFile(input(id)).map((f) => [f.key, f]));

describe("buildCaseFile on the demo scenarios", () => {
  it("ds001_has_paypal_csv_and_derived_facts", () => {
    expect(keys("DS-001")).toEqual(
      [
        "derived.days_ship_to_open",
        "derived.ship_address_match",
        "dispute.amount",
        "dispute.id",
        "dispute.items",
        "dispute.opened_at",
        "dispute.reason",
        "dispute.response_due",
        "dispute.stage",
        "dispute.transaction_id",
        "fulfil.carrier",
        "fulfil.delivered_at",
        "fulfil.last_scan_at",
        "fulfil.ship_to.country",
        "fulfil.ship_to.postal_code",
        "fulfil.shipped_at",
        "fulfil.tracking.number",
        "order.capture_id",
        "order.id",
        "order.ship_to.country",
        "order.ship_to.postal_code",
        "refund.exists",
        "tracking.carrier",
        "tracking.number",
        "tracking.on_paypal",
        "txn.amount",
        "txn.date",
        "txn.id",
        "txn.item_names",
        "txn.protection_eligibility",
        "txn.ship_to.country",
        "txn.ship_to.postal_code",
      ].sort(),
    );
    const f = byKey("DS-001");
    expect(f.get("dispute.amount")?.display).toBe("USD 48.00");
    expect(f.get("tracking.number")?.display).toBe("1Z999AA10123456784");
    expect(f.get("derived.ship_address_match")?.display).toBe("Yes");
    expect(f.get("fulfil.shipped_at")?.confidence).toBe("SELLER_UPLOAD");
    expect(f.get("txn.id")?.confidence).toBe("PAYPAL");
  });

  it("ds003_has_the_refund", () => {
    const f = byKey("DS-003");
    expect(f.get("refund.exists")?.display).toBe("Yes");
    expect(f.get("refund.amount")?.display).toBe("USD 36.00");
    expect(f.get("refund.id")?.display).toBe("1RF44205GH318267C");
    expect(f.get("dispute.reason")?.display).toBe("Credit not processed");
  });

  it("ds002_without_the_csv_has_no_delivery_fact_and_no_placeholder (AC-CASE-03)", () => {
    const k = keys("DS-002", false);
    expect(k.some((x) => x.startsWith("fulfil."))).toBe(false);
    for (const f of buildCaseFile(input("DS-002", false))) {
      expect(f.display).not.toMatch(/^(?:unknown|n\/a|-|null|undefined)?$/i);
    }
  });

  it("every_fact_points_at_its_source", () => {
    for (const id of ["DS-001", "DS-002", "DS-003", "DS-004"]) {
      for (const f of buildCaseFile(input(id))) {
        expect(f.sourcePayloadId, f.key).toMatch(/^p-|,/);
        expect(f.jsonPath, f.key).not.toBe("");
      }
    }
  });

  it("keeps_both_tracking_numbers_when_csv_and_paypal_disagree", () => {
    const i = input("DS-001");
    if (i.fulfilment)
      i.fulfilment.body = {
        ...i.fulfilment.body,
        trackingNumber: "9400111899223344556677",
      };
    const f = buildCaseFile(i);
    expect(f.find((x) => x.key === "tracking.number")?.display).toBe(
      "1Z999AA10123456784",
    );
    expect(f.find((x) => x.key === "fulfil.tracking.number")?.display).toBe(
      "9400111899223344556677",
    );
  });
});
