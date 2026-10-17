import type {
  ChecklistItem,
  DecisionAid,
  EvidenceType,
  Money,
  Strength,
} from "@ds/schemas";
import { deadlineBand, formatTimeLeft, hoursLeft } from "../time/deadlines.js";
import { displayMoney } from "./money.js";

// Decision aid (05-evidence-engine-spec.md section 6). Rules are assumptions shown in the UI under
// "How this is decided"; the output is never a probability.

export const DEFAULT_HIGH_VALUE_MINOR = 10_000;

export type DecisionInput = {
  kind: "INR" | "REFUND" | "GENERIC";
  strength: Strength | null;
  checklist: ChecklistItem[];
  amount: Money;
  dueAt: string | null;
  allowedActions: string[];
  /** Refund already recorded on the order, in the disputed currency (minor units). */
  refundedMinor: number;
  caseState: string;
  now: Date;
  highValueMinor?: number;
};

export const RUBRIC = [
  "No evidence link from PayPal: evidence cannot be sent; accept the claim if PayPal allows it, otherwise review.",
  "Strong evidence (tracking, delivery and address confirmed): fight.",
  "Weak evidence that cannot be fixed before the deadline: accept the claim if PayPal allows it.",
  "Medium evidence: fight when the amount is at or above the high-value threshold, otherwise review.",
  "A refund that already covers the full amount: send proof of refund instead of accepting.",
  "Past the response deadline: nothing can be sent.",
];

export function decide(i: DecisionInput): DecisionAid {
  const band = deadlineBand(i.dueAt, i.now);
  const canFight = i.allowedActions.includes("provide_evidence");
  const canAccept = i.allowedActions.includes("accept_claim");
  const highValue =
    i.amount.minor >= (i.highValueMinor ?? DEFAULT_HIGH_VALUE_MINOR);
  const because: string[] = [];
  const blockers: string[] = [];
  let recommended: DecisionAid["recommended"];
  let evidenceType: EvidenceType | null =
    i.kind === "INR"
      ? "PROOF_OF_FULFILLMENT"
      : i.kind === "REFUND"
        ? "PROOF_OF_REFUND"
        : null;

  if (band === "OVERDUE")
    blockers.push("The response deadline has passed, so nothing can be sent.");
  if (
    [
      "EXPIRED",
      "SUBMITTED",
      "AWAITING_OUTCOME",
      "CLOSED_WON",
      "CLOSED_LOST",
      "CLOSED_ACCEPTED",
    ].includes(i.caseState)
  ) {
    blockers.push("This case is no longer open for a response.");
  }
  const missing = i.checklist.filter((c) => c.blocking && c.status !== "MET");
  for (const c of missing)
    blockers.push(
      `${c.label}: ${c.status === "CONFLICT" ? "conflicting records" : "missing"}.`,
    );

  if (i.refundedMinor >= i.amount.minor && i.amount.minor > 0) {
    recommended = canFight ? "FIGHT" : "REVIEW";
    evidenceType = "PROOF_OF_REFUND";
    because.push(
      `A refund of ${displayMoney({ currency: i.amount.currency, minor: i.refundedMinor })} already covers the disputed amount.`,
    );
    if (!canFight)
      because.push(
        "PayPal is not asking for evidence on this dispute right now.",
      );
  } else if (i.kind === "GENERIC") {
    recommended = "REVIEW";
    because.push("Dispute Shield does not draft evidence for this reason yet.");
  } else if (!canFight) {
    recommended = canAccept ? "ACCEPT" : "REVIEW";
    because.push(
      "PayPal is not asking for evidence on this dispute right now (no evidence link).",
    );
  } else if (i.strength === "STRONG") {
    recommended = "FIGHT";
    because.push(
      "Tracking, delivery and the delivery address are all confirmed by records.",
    );
  } else if (i.strength === "WEAK") {
    recommended = canAccept && band !== "OK" ? "ACCEPT" : "REVIEW";
    because.push(
      missing.length > 0
        ? "A required record is missing, so evidence cannot be drafted yet."
        : "Key records are missing.",
    );
    if (recommended === "REVIEW" && band === "OK")
      because.push(
        "There is still time to add the missing records before the deadline.",
      );
  } else {
    recommended = highValue ? "FIGHT" : "REVIEW";
    because.push(
      "Tracking exists, but delivery or the delivery address is not confirmed.",
    );
    because.push(
      highValue
        ? "The amount is at or above the high-value threshold."
        : "The amount is below the high-value threshold.",
    );
  }
  if (i.kind === "INR" && i.strength && i.strength !== "WEAK") {
    const unmet = i.checklist.filter((c) => !c.blocking && c.status !== "MET");
    if (unmet.length > 0)
      because.push(
        `Not confirmed: ${unmet.map((c) => c.label.toLowerCase()).join("; ")}.`,
      );
  }

  const h = hoursLeft(i.dueAt, i.now);
  return {
    recommended,
    evidenceType: recommended === "FIGHT" ? evidenceType : null,
    because,
    amountAtRisk: i.amount,
    costOfFighting: `About 5 minutes to review; deadline: ${formatTimeLeft(i.dueAt, i.now)}.`,
    deadline: { dueAt: i.dueAt, hoursLeft: h, band },
    blockers,
  };
}
