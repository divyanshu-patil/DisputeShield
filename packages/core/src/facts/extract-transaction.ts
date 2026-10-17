import type { Fact, PaypalTransactionDetail } from "@ds/schemas";
import { displayMoney, toMinor } from "../decision/money.js";
import { displayDate } from "../time/deadlines.js";
import { type Source, fact } from "./fact.js";

export const PROTECTION_LABELS: Record<string, string> = {
  "01": "Eligible",
  "02": "Not eligible",
  "03": "Partially eligible",
};

/** txn.* facts from one Transaction Search row (contract 4). The payload is that single row. */
export function extractTransaction(
  t: PaypalTransactionDetail,
  src: Source,
): Fact[] {
  const info = t.transaction_info;
  const amount = info.transaction_amount;
  const money = {
    currency: amount.currency_code,
    minor: toMinor(amount.value, amount.currency_code),
  };
  const out: Fact[] = [
    fact(
      src,
      "txn.id",
      "Transaction ID",
      info.transaction_id,
      info.transaction_id,
      "transaction_info.transaction_id",
    ),
    fact(
      src,
      "txn.date",
      "Payment date",
      info.transaction_initiation_date,
      displayDate(info.transaction_initiation_date),
      "transaction_info.transaction_initiation_date",
    ),
    fact(
      src,
      "txn.amount",
      "Payment amount",
      money.minor,
      displayMoney(money),
      "transaction_info.transaction_amount",
    ),
  ];
  const prot = info.protection_eligibility;
  if (prot) {
    out.push(
      fact(
        src,
        "txn.protection_eligibility",
        "Seller protection",
        prot,
        PROTECTION_LABELS[prot] ?? prot,
        "transaction_info.protection_eligibility",
      ),
    );
  }
  const items = (t.cart_info?.item_details ?? []).flatMap((i) =>
    i.item_name ? [i.item_name] : [],
  );
  if (items.length > 0) {
    out.push(
      fact(
        src,
        "txn.item_names",
        "Items",
        items.join("; "),
        items.join("; "),
        "cart_info.item_details",
      ),
    );
  }
  const addr = t.shipping_info?.address;
  if (addr?.postal_code) {
    out.push(
      fact(
        src,
        "txn.ship_to.postal_code",
        "Ship-to postal code",
        addr.postal_code,
        addr.postal_code,
        "shipping_info.address.postal_code",
      ),
    );
  }
  if (addr?.country_code) {
    out.push(
      fact(
        src,
        "txn.ship_to.country",
        "Ship-to country",
        addr.country_code,
        addr.country_code,
        "shipping_info.address.country_code",
      ),
    );
  }
  return out;
}
