import type {
  Fact,
  FulfilmentRecord,
  PaypalDisputeDetails,
  PaypalOrder,
  PaypalTransactionDetail,
} from "@ds/schemas";
import { type Source, fact, yesNo } from "./fact.js";
import { extractDispute } from "./extract-dispute.js";
import { extractFulfilment } from "./extract-fulfilment.js";
import { extractOrder, extractTracker } from "./extract-order.js";
import { extractTransaction } from "./extract-transaction.js";

type Sourced<T> = { body: T } & Source;

export type CaseFileInput = {
  dispute: Sourced<PaypalDisputeDetails>;
  transaction?: Sourced<PaypalTransactionDetail>;
  order?: Sourced<PaypalOrder>;
  trackers?: Sourced<Parameters<typeof extractTracker>[0]>[];
  fulfilment?: Sourced<FulfilmentRecord>;
};

const norm = (s: string): string => s.replace(/[\s-]/g, "").toUpperCase();

/**
 * Merges every extractor's facts. PayPal sources come first; a CSV value only fills tracking.* when PayPal
 * has none, and a disagreement keeps both facts (the checklist turns it into CONFLICT, 05 section 2.3).
 */
export function buildCaseFile(input: CaseFileInput): Fact[] {
  const facts: Fact[] = [...extractDispute(input.dispute.body, input.dispute)];
  if (input.transaction)
    facts.push(
      ...extractTransaction(input.transaction.body, input.transaction),
    );
  if (input.order) facts.push(...extractOrder(input.order.body, input.order));
  for (const t of input.trackers ?? [])
    facts.push(...extractTracker(t.body, t));
  if (input.fulfilment)
    facts.push(...extractFulfilment(input.fulfilment.body, input.fulfilment));

  const byKey = new Map<string, Fact>();
  for (const f of facts) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const get = (k: string) => byKey.get(k);

  // CSV tracking stands in for PayPal tracking only when PayPal has none.
  const csvNumber = get("fulfil.tracking.number");
  const csvCarrier = get("fulfil.carrier");
  if (!get("tracking.number") && csvNumber) {
    byKey.set("tracking.number", {
      ...csvNumber,
      key: "tracking.number",
      label: "Tracking number",
    });
    if (csvCarrier)
      byKey.set("tracking.carrier", {
        ...csvCarrier,
        key: "tracking.carrier",
        label: "Carrier",
      });
  }
  // Derived facts cite their inputs in jsonPath (05 section 2.2).
  const derivedSrc = (keys: string[]): Source & { path: string } => ({
    payloadId: input.dispute.payloadId,
    fetchedAt: input.dispute.fetchedAt,
    confidence: "DERIVED",
    path: keys.join(","),
  });
  const orderPostal =
    get("txn.ship_to.postal_code") ?? get("order.ship_to.postal_code");
  const shippedPostal = get("fulfil.ship_to.postal_code");
  if (orderPostal && shippedPostal) {
    const orderCountry =
      get("txn.ship_to.country") ?? get("order.ship_to.country");
    const shippedCountry = get("fulfil.ship_to.country");
    const match =
      norm(orderPostal.display) === norm(shippedPostal.display) &&
      (!orderCountry ||
        !shippedCountry ||
        norm(orderCountry.display) === norm(shippedCountry.display));
    const keys = [orderPostal.key, shippedPostal.key];
    const d = derivedSrc(keys);
    byKey.set(
      "derived.ship_address_match",
      fact(
        d,
        "derived.ship_address_match",
        "Ship address matches order",
        match,
        yesNo(match),
        d.path,
      ),
    );
  }
  const shipped = get("fulfil.shipped_at");
  const opened = get("dispute.opened_at");
  if (shipped && opened) {
    const days = Math.round(
      (Date.parse(opened.display) - Date.parse(shipped.display)) / 86_400_000,
    );
    const d = derivedSrc([shipped.key, opened.key]);
    byKey.set(
      "derived.days_ship_to_open",
      fact(
        d,
        "derived.days_ship_to_open",
        "Days from shipping to dispute",
        days,
        String(days),
        d.path,
      ),
    );
  }
  return [...byKey.values()];
}

/** Whether PayPal's tracking and the seller's file disagree (AC-CASE-04). */
export function trackingConflict(facts: Fact[]): boolean {
  const paypal = facts.find(
    (f) => f.key === "tracking.number" && f.confidence === "PAYPAL",
  );
  const csv = facts.find((f) => f.key === "fulfil.tracking.number");
  return !!paypal && !!csv && norm(paypal.display) !== norm(csv.display);
}
