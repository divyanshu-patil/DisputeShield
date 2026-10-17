import type { Dispute, PaypalDisputeDetails } from "@ds/schemas";
import { toMinor } from "../decision/money.js";

/** Dispute details to the stored row. Allowed actions are the POST link rels (contract 2.2: link = permission). */
export function normaliseDispute(d: PaypalDisputeDetails): Dispute {
  return {
    id: d.dispute_id,
    reason: d.reason,
    paypalStatus: d.status,
    disputeState: d.dispute_state ?? null,
    stage: d.dispute_life_cycle_stage ?? "INQUIRY",
    amountMinor: toMinor(
      d.dispute_amount.value,
      d.dispute_amount.currency_code,
    ),
    currency: d.dispute_amount.currency_code,
    disputedTransactionId:
      d.disputed_transactions[0]?.seller_transaction_id ?? null,
    createdAtPaypal: d.create_time,
    updatedAtPaypal: d.update_time,
    sellerResponseDue: d.seller_response_due_date ?? null,
    allowedActions: d.links
      .filter((l) => l.method === "POST" && l.rel !== "self")
      .map((l) => l.rel),
  };
}
