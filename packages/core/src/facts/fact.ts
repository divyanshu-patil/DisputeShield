import type { Fact, FactConfidence } from "@ds/schemas";

export type Source = {
  payloadId: string;
  fetchedAt: string;
  confidence?: FactConfidence;
};

/** Builds one fact. Missing values never become facts (05 section 2.3), so callers skip undefined. */
export function fact(
  src: Source,
  key: string,
  label: string,
  value: Fact["value"],
  display: string,
  jsonPath: string,
): Fact {
  return {
    key,
    label,
    value,
    display,
    sourcePayloadId: src.payloadId,
    jsonPath,
    fetchedAt: src.fetchedAt,
    confidence: src.confidence ?? "PAYPAL",
  };
}

export const yesNo = (b: boolean): string => (b ? "Yes" : "No");

const titleCase = (s: string): string =>
  s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");

export const REASON_LABELS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Item not as described",
  UNAUTHORISED: "Unauthorised payment",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid by other means",
  CANCELED_RECURRING_BILLING: "Cancelled recurring billing",
  PROBLEM_WITH_REMITTANCE: "Problem with remittance",
  OTHER: "Other",
};

export const reasonLabel = (reason: string): string =>
  REASON_LABELS[reason] ?? titleCase(reason);

export const stageLabel = (stage: string): string => titleCase(stage);
