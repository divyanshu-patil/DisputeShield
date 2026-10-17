import type { Fact } from "@ds/schemas";

/** DS-001-like fact set (05 section 2.2 display examples). */
export function ds001Facts(over: Partial<Record<string, string>> = {}): Fact[] {
  const rows: [string, string, string, Fact["confidence"]][] = [
    ["dispute.id", "Dispute ID", "PP-D-27803", "PAYPAL"],
    ["dispute.reason", "Dispute reason", "Item not received", "PAYPAL"],
    ["dispute.amount", "Amount in dispute", "USD 48.00", "PAYPAL"],
    ["dispute.opened_at", "Dispute opened", "2026-10-02", "PAYPAL"],
    ["txn.id", "Transaction ID", "5TY05013RG002845M", "PAYPAL"],
    ["txn.date", "Payment date", "2026-09-24", "PAYPAL"],
    ["txn.amount", "Payment amount", "USD 48.00", "PAYPAL"],
    ["txn.protection_eligibility", "Seller protection", "Eligible", "PAYPAL"],
    ["txn.ship_to.postal_code", "Ship-to postal code", "560001", "PAYPAL"],
    ["tracking.number", "Tracking number", "1Z999AA10123456784", "PAYPAL"],
    ["tracking.carrier", "Carrier", "UPS", "PAYPAL"],
    ["tracking.on_paypal", "Tracking on PayPal", "Yes", "PAYPAL"],
    ["fulfil.shipped_at", "Shipped", "2026-09-25", "SELLER_UPLOAD"],
    ["fulfil.delivered_at", "Delivered", "2026-09-29", "SELLER_UPLOAD"],
    [
      "fulfil.ship_to.postal_code",
      "Shipped-to postal code",
      "560001",
      "SELLER_UPLOAD",
    ],
    [
      "derived.ship_address_match",
      "Ship address matches order",
      "Yes",
      "DERIVED",
    ],
  ];
  return rows.map(([key, label, display, confidence]) => ({
    key,
    label,
    value: over[key] ?? display,
    display: over[key] ?? display,
    sourcePayloadId: "payload-1",
    jsonPath: key,
    fetchedAt: "2026-10-03T00:00:00Z",
    confidence,
  }));
}
