import type { Fact, PaypalDisputeDetails } from "@ds/schemas";
import { displayMoney, toMinor } from "../decision/money.js";
import { displayDate } from "../time/deadlines.js";
import { type Source, fact, reasonLabel, stageLabel } from "./fact.js";

/** dispute.* facts from GET /v1/customer/disputes/{id} (contract 2.2). */
export function extractDispute(d: PaypalDisputeDetails, src: Source): Fact[] {
  const out: Fact[] = [];
  const amount = d.dispute_amount;
  const money = {
    currency: amount.currency_code,
    minor: toMinor(amount.value, amount.currency_code),
  };
  out.push(
    fact(
      src,
      "dispute.id",
      "Dispute ID",
      d.dispute_id,
      d.dispute_id,
      "dispute_id",
    ),
    fact(
      src,
      "dispute.reason",
      "Dispute reason",
      d.reason,
      reasonLabel(d.reason),
      "reason",
    ),
    fact(
      src,
      "dispute.amount",
      "Amount in dispute",
      money.minor,
      displayMoney(money),
      "dispute_amount",
    ),
    fact(
      src,
      "dispute.opened_at",
      "Dispute opened",
      d.create_time,
      displayDate(d.create_time),
      "create_time",
    ),
  );
  if (d.seller_response_due_date) {
    out.push(
      fact(
        src,
        "dispute.response_due",
        "Response due",
        d.seller_response_due_date,
        displayDate(d.seller_response_due_date),
        "seller_response_due_date",
      ),
    );
  }
  if (d.dispute_life_cycle_stage) {
    out.push(
      fact(
        src,
        "dispute.stage",
        "Stage",
        d.dispute_life_cycle_stage,
        stageLabel(d.dispute_life_cycle_stage),
        "dispute_life_cycle_stage",
      ),
    );
  }
  const txn = d.disputed_transactions[0];
  if (txn?.seller_transaction_id) {
    out.push(
      fact(
        src,
        "dispute.transaction_id",
        "Disputed transaction",
        txn.seller_transaction_id,
        txn.seller_transaction_id,
        "disputed_transactions[0].seller_transaction_id",
      ),
    );
  }
  const names = (txn?.items ?? []).flatMap((i) =>
    i.item_name ? [i.item_name] : [],
  );
  if (names.length > 0) {
    out.push(
      fact(
        src,
        "dispute.items",
        "Items in dispute",
        names.join("; "),
        names.join("; "),
        "disputed_transactions[0].items",
      ),
    );
  }
  return out;
}
