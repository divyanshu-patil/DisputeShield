import type { RiskFinding, RiskThresholds, Severity } from "@ds/schemas";
import { displayMoney } from "../decision/money.js";
import { displayDate } from "../time/deadlines.js";

// Prevent rules (05-evidence-engine-spec.md section 8). Thresholds are assumptions; reasons name the gap
// and never predict a dispute.

export type RiskTransaction = {
  id: string;
  occurredAt: string;
  amountMinor: number;
  currency: string;
  protectionEligibility: string | null;
  shipToPostal: string | null;
  shipToCountry: string | null;
  trackingOnPaypal: boolean;
};

export type RiskFulfilment = {
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastScanAt: string | null;
  shipToPostal: string | null;
  shipToCountry: string | null;
} | null;

const norm = (s: string | null): string =>
  (s ?? "").replace(/\s/g, "").toUpperCase();
const RAISE: Record<Severity, Severity> = {
  LOW: "MEDIUM",
  MEDIUM: "HIGH",
  HIGH: "HIGH",
};

export function evaluateRisk(
  t: RiskTransaction,
  f: RiskFulfilment,
  now: Date,
  th: RiskThresholds,
): RiskFinding[] {
  const out: RiskFinding[] = [];
  const amount = displayMoney({ currency: t.currency, minor: t.amountMinor });
  const paid = displayDate(t.occurredAt);

  if (t.protectionEligibility === "02" || t.protectionEligibility === "03") {
    const label =
      t.protectionEligibility === "02"
        ? "not eligible"
        : "only partially eligible";
    out.push({
      rule: "R-PROT",
      severity: t.protectionEligibility === "02" ? "MEDIUM" : "LOW",
      reason: `The ${amount} payment on ${paid} is ${label} for seller protection, which commonly weakens a later case.`,
      factRefs: {
        "txn.protection_eligibility": t.protectionEligibility,
        "txn.amount": amount,
      },
      suggestedAction: "REVIEW",
    });
  }
  if (f && f.shipToPostal && t.shipToPostal) {
    const postalDiffers = norm(f.shipToPostal) !== norm(t.shipToPostal);
    const countryDiffers =
      !!f.shipToCountry &&
      !!t.shipToCountry &&
      norm(f.shipToCountry) !== norm(t.shipToCountry);
    if (postalDiffers || countryDiffers) {
      out.push({
        rule: "R-ADDR",
        severity: "HIGH",
        reason: `Your file ships to postal code ${f.shipToPostal}${f.shipToCountry ? ` (${f.shipToCountry})` : ""}, but the PayPal payment's ship-to postal code is ${t.shipToPostal}${t.shipToCountry ? ` (${t.shipToCountry})` : ""}.`,
        factRefs: {
          "txn.ship_to.postal_code": t.shipToPostal,
          "fulfil.ship_to.postal_code": f.shipToPostal,
        },
        suggestedAction: "REVIEW",
      });
    }
  }
  const hoursSincePaid = (now.getTime() - Date.parse(t.occurredAt)) / 3_600_000;
  const hasTracking = t.trackingOnPaypal || !!f?.trackingNumber;
  if (!hasTracking && hoursSincePaid > th.noTrackingAfterHours) {
    out.push({
      rule: "R-NOTRACK",
      severity: "HIGH",
      reason: `No tracking is recorded on PayPal or in your file ${Math.floor(hoursSincePaid)} hours after the ${amount} payment on ${paid}.`,
      factRefs: { "tracking.on_paypal": "No", "txn.date": paid },
      suggestedAction: "ADD_TRACKING",
    });
  }
  if (hasTracking && f && !f.deliveredAt && f.lastScanAt) {
    const days = (now.getTime() - Date.parse(f.lastScanAt)) / 86_400_000;
    if (days > th.stuckTrackingDays) {
      out.push({
        rule: "R-STUCK",
        severity: "MEDIUM",
        reason: `The last carrier scan was on ${displayDate(f.lastScanAt)} and there is no delivery yet.`,
        factRefs: { "fulfil.last_scan_at": displayDate(f.lastScanAt) },
        suggestedAction: "REVIEW",
      });
    }
  }
  // R-HIGH raises every finding by one level at or above the threshold.
  if (t.amountMinor >= th.highValueMinor) {
    for (const x of out) x.severity = RAISE[x.severity];
  }
  return out;
}
