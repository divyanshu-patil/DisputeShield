import type { Fact, FulfilmentRecord } from "@ds/schemas";
import { displayDate } from "../time/deadlines.js";
import { type Source, fact } from "./fact.js";

/** fulfil.* facts from the seller's CSV row (confidence SELLER_UPLOAD; 05 section 2.4). */
export function extractFulfilment(r: FulfilmentRecord, src: Source): Fact[] {
  const s: Source = { ...src, confidence: "SELLER_UPLOAD" };
  const out: Fact[] = [];
  if (r.trackingNumber)
    out.push(
      fact(
        s,
        "fulfil.tracking.number",
        "Tracking number (your file)",
        r.trackingNumber,
        r.trackingNumber,
        "tracking_number",
      ),
    );
  if (r.carrier)
    out.push(
      fact(
        s,
        "fulfil.carrier",
        "Carrier (your file)",
        r.carrier,
        r.carrier,
        "carrier",
      ),
    );
  if (r.shippedAt)
    out.push(
      fact(
        s,
        "fulfil.shipped_at",
        "Shipped",
        r.shippedAt,
        displayDate(r.shippedAt),
        "shipped_at",
      ),
    );
  if (r.deliveredAt)
    out.push(
      fact(
        s,
        "fulfil.delivered_at",
        "Delivered",
        r.deliveredAt,
        displayDate(r.deliveredAt),
        "delivered_at",
      ),
    );
  if (r.lastScanAt)
    out.push(
      fact(
        s,
        "fulfil.last_scan_at",
        "Last carrier scan",
        r.lastScanAt,
        displayDate(r.lastScanAt),
        "last_scan_at",
      ),
    );
  if (r.shipToPostal)
    out.push(
      fact(
        s,
        "fulfil.ship_to.postal_code",
        "Shipped-to postal code",
        r.shipToPostal,
        r.shipToPostal,
        "ship_to_postal",
      ),
    );
  if (r.shipToCountry)
    out.push(
      fact(
        s,
        "fulfil.ship_to.country",
        "Shipped-to country",
        r.shipToCountry,
        r.shipToCountry,
        "ship_to_country",
      ),
    );
  return out;
}
