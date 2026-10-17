import type { Fact, PaypalOrder } from "@ds/schemas";
import { displayMoney, toMinor } from "../decision/money.js";
import { displayDate } from "../time/deadlines.js";
import { type Source, fact, yesNo } from "./fact.js";

/**
 * order.*, refund.* and tracking.on_paypal facts from GET /v2/checkout/orders/{id} (contract 5).
 * Paths per S7: purchase_units[0].payments.captures/refunds, purchase_units[0].shipping.address/trackers.
 */
export function extractOrder(o: PaypalOrder, src: Source): Fact[] {
  const out: Fact[] = [fact(src, "order.id", "Order ID", o.id, o.id, "id")];
  const pu = o.purchase_units[0];
  const p = "purchase_units[0]";
  const addr = pu?.shipping?.address;
  if (addr?.postal_code) {
    out.push(
      fact(
        src,
        "order.ship_to.postal_code",
        "Order ship-to postal code",
        addr.postal_code,
        addr.postal_code,
        `${p}.shipping.address.postal_code`,
      ),
    );
  }
  if (addr?.country_code) {
    out.push(
      fact(
        src,
        "order.ship_to.country",
        "Order ship-to country",
        addr.country_code,
        addr.country_code,
        `${p}.shipping.address.country_code`,
      ),
    );
  }
  const capture = pu?.payments?.captures?.[0];
  if (capture) {
    out.push(
      fact(
        src,
        "order.capture_id",
        "Capture ID",
        capture.id,
        capture.id,
        `${p}.payments.captures[0].id`,
      ),
    );
  }
  const trackers = pu?.shipping?.trackers ?? [];
  out.push(
    fact(
      src,
      "tracking.on_paypal",
      "Tracking on PayPal",
      trackers.length > 0,
      yesNo(trackers.length > 0),
      `${p}.shipping.trackers`,
    ),
  );

  const refunds = (pu?.payments?.refunds ?? []).filter(
    (r) => r.status !== "CANCELLED" && r.status !== "FAILED",
  );
  out.push(
    fact(
      src,
      "refund.exists",
      "Refund issued",
      refunds.length > 0,
      yesNo(refunds.length > 0),
      `${p}.payments.refunds`,
    ),
  );
  if (refunds.length > 0) {
    const total = refunds.reduce(
      (sum, r) =>
        sum + (r.amount ? toMinor(r.amount.value, r.amount.currency_code) : 0),
      0,
    );
    const currency = refunds[0]?.amount?.currency_code ?? "USD";
    const first = refunds[0];
    if (first)
      out.push(
        fact(
          src,
          "refund.id",
          "Refund ID",
          first.id,
          first.id,
          `${p}.payments.refunds[0].id`,
        ),
      );
    out.push(
      fact(
        src,
        "refund.amount",
        "Refund amount",
        total,
        displayMoney({ currency, minor: total }),
        `${p}.payments.refunds`,
      ),
    );
    const created =
      typeof first?.["create_time"] === "string"
        ? first["create_time"]
        : undefined;
    if (created) {
      out.push(
        fact(
          src,
          "refund.date",
          "Refund date",
          created,
          displayDate(created),
          `${p}.payments.refunds[0].create_time`,
        ),
      );
    }
  }
  return out;
}

/**
 * tracking.number / tracking.carrier from a PayPal tracker. Order trackers carry the id
 * `<capture id>-<tracking number>` ⚠️ (S8 confirms); a tracker detail payload may carry the fields directly.
 */
export function extractTracker(
  t: {
    id?: string;
    tracking_number?: string;
    carrier?: string;
    carrier_name_other?: string;
    transaction_id?: string;
  },
  src: Source,
  path = "",
): Fact[] {
  const at = (k: string) => (path ? `${path}.${k}` : k);
  const out: Fact[] = [];
  const number =
    t.tracking_number ??
    (t.id && t.transaction_id && t.id.startsWith(`${t.transaction_id}-`)
      ? t.id.slice(t.transaction_id.length + 1)
      : undefined);
  if (number)
    out.push(
      fact(
        src,
        "tracking.number",
        "Tracking number",
        number,
        number,
        at(t.tracking_number ? "tracking_number" : "id"),
      ),
    );
  const carrier = t.carrier === "OTHER" ? t.carrier_name_other : t.carrier;
  if (carrier)
    out.push(
      fact(
        src,
        "tracking.carrier",
        "Carrier",
        carrier,
        carrier,
        at(t.carrier === "OTHER" ? "carrier_name_other" : "carrier"),
      ),
    );
  return out;
}
