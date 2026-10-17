import type {
  ChecklistItem,
  ChecklistStatus,
  EvidenceType,
  Fact,
  RecommendedAction,
  Strength,
} from "@ds/schemas";
import { trackingConflict } from "../facts/build-case-file.js";

// Evidence checklists and strength (05-evidence-engine-spec.md section 3). Strength is a checklist
// result, not a prediction.

export const INR_REASONS = new Set(["MERCHANDISE_OR_SERVICE_NOT_RECEIVED"]);
export const REFUND_REASONS = new Set([
  "CREDIT_NOT_PROCESSED",
  "DUPLICATE_TRANSACTION",
]);

export type CaseKind = "INR" | "REFUND" | "GENERIC";

export type Assessment = {
  kind: CaseKind;
  checklist: ChecklistItem[];
  strength: Strength | null;
  recommendedAction: RecommendedAction;
  evidenceType: EvidenceType | null;
  /** Plain-language list of what is missing (cases.needs_info). */
  needsInfo: string[];
};

export const caseKind = (reason: string): CaseKind =>
  INR_REASONS.has(reason)
    ? "INR"
    : REFUND_REASONS.has(reason)
      ? "REFUND"
      : "GENERIC";

const CSV_FIX =
  "Upload your fulfilment CSV on the Fulfilment page, then press Re-collect.";

function item(
  key: string,
  label: string,
  status: ChecklistStatus,
  blocking: boolean,
  factKeys: string[],
  fix?: string,
): ChecklistItem {
  return {
    key,
    label,
    status,
    blocking,
    factKeys,
    ...(status !== "MET" && fix ? { fix } : {}),
  };
}

export function assessCase(reason: string, facts: Fact[]): Assessment {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const has = (k: string) => byKey.has(k);
  const is = (k: string, display: string) => byKey.get(k)?.display === display;
  const met = (ok: boolean): ChecklistStatus => (ok ? "MET" : "MISSING");
  const kind = caseKind(reason);

  if (kind === "INR") {
    const conflict = trackingConflict(facts);
    const shipped = byKey.get("fulfil.shipped_at");
    const opened = byKey.get("dispute.opened_at");
    const checklist = [
      item(
        "INR-1",
        "Tracking number and carrier exist",
        conflict
          ? "CONFLICT"
          : met(has("tracking.number") && has("tracking.carrier")),
        true,
        [
          "tracking.number",
          "tracking.carrier",
          ...(conflict ? ["fulfil.tracking.number"] : []),
        ],
        conflict
          ? "PayPal's tracking number and your file disagree. Correct your file or the PayPal tracker, then Re-collect."
          : CSV_FIX,
      ),
      item(
        "INR-2",
        "Shipped before the dispute was opened",
        met(!!shipped && !!opened && shipped.display < opened.display),
        false,
        ["fulfil.shipped_at", "dispute.opened_at"],
        CSV_FIX,
      ),
      item(
        "INR-3",
        "Delivery confirmed",
        met(has("fulfil.delivered_at")),
        false,
        ["fulfil.delivered_at"],
        CSV_FIX,
      ),
      item(
        "INR-4",
        "Delivered to the order address",
        met(is("derived.ship_address_match", "Yes")),
        false,
        ["derived.ship_address_match"],
        "Add the shipped-to postal code to your fulfilment CSV.",
      ),
      item(
        "INR-5",
        "Tracking is on PayPal",
        met(is("tracking.on_paypal", "Yes")),
        false,
        ["tracking.on_paypal"],
        "Add the tracking number to the PayPal order (Risk page, Add tracking).",
      ),
      item(
        "INR-6",
        "Payment is seller-protection eligible",
        met(is("txn.protection_eligibility", "Eligible")),
        false,
        ["txn.protection_eligibility"],
      ),
    ];
    const s = (k: string) => checklist.find((c) => c.key === k)?.status;
    const strength: Strength =
      s("INR-1") !== "MET"
        ? "WEAK"
        : s("INR-3") === "MET" && s("INR-4") === "MET"
          ? "STRONG"
          : "MEDIUM";
    return {
      kind,
      checklist,
      strength,
      recommendedAction: "PROVIDE_EVIDENCE",
      evidenceType: "PROOF_OF_FULFILLMENT",
      needsInfo: needs(checklist),
    };
  }

  if (kind === "REFUND") {
    const amount = byKey.get("dispute.amount");
    const refund = byKey.get("refund.amount");
    const refundDate = byKey.get("refund.date");
    const opened = byKey.get("dispute.opened_at");
    const refunded = is("refund.exists", "Yes");
    const checklist = [
      item(
        "REF-1",
        "A refund exists for the disputed payment",
        met(refunded),
        true,
        ["refund.exists"],
        "No refund is recorded on the PayPal order.",
      ),
      item(
        "REF-2",
        "Refund covers the disputed amount",
        met(
          !!amount &&
            !!refund &&
            sameCurrency(amount, refund) &&
            Number(refund.value) >= Number(amount.value),
        ),
        false,
        ["refund.amount", "dispute.amount"],
      ),
      item(
        "REF-3",
        "Refund was made before the dispute",
        met(!!refundDate && !!opened && refundDate.display < opened.display),
        false,
        ["refund.date", "dispute.opened_at"],
      ),
    ];
    const s = (k: string) => checklist.find((c) => c.key === k)?.status;
    const strength: Strength =
      s("REF-1") !== "MET"
        ? "WEAK"
        : s("REF-2") === "MET"
          ? "STRONG"
          : "MEDIUM";
    return {
      kind,
      checklist,
      strength,
      recommendedAction: refunded ? "PROVIDE_EVIDENCE" : "ACCEPT_CLAIM",
      evidenceType: refunded ? "PROOF_OF_REFUND" : null,
      needsInfo: needs(checklist),
    };
  }

  return {
    kind,
    checklist: [],
    strength: null,
    recommendedAction: "MANUAL",
    evidenceType: null,
    needsInfo: ["Dispute Shield does not draft evidence for this reason yet."],
  };
}

const sameCurrency = (a: Fact, b: Fact) =>
  a.display.slice(0, 3) === b.display.slice(0, 3);

function needs(checklist: ChecklistItem[]): string[] {
  return checklist
    .filter((c) => c.blocking && c.status !== "MET")
    .map((c) =>
      `${c.label}: ${c.status === "CONFLICT" ? "conflict" : "missing"}. ${c.fix ?? ""}`.trim(),
    );
}

/** Drafting is allowed only when every blocking item is MET (AC-EVID-06, AC-CASE-04). */
export const blockingMet = (checklist: ChecklistItem[]): boolean =>
  checklist.every((c) => !c.blocking || c.status === "MET");
