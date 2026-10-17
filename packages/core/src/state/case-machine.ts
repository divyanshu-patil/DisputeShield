import type { CaseState } from "@ds/schemas";

// Case state machine (04-data-model.md section 3). Pure; the repo refuses states it did not produce.

export type CaseEvent =
  | "COLLECT"
  | "COLLECTED_READY"
  | "COLLECTED_NEEDS_INFO"
  | "APPROVE"
  | "SUBMITTED"
  | "PAYPAL_REVIEWING"
  | "RESOLVED_WON"
  | "RESOLVED_LOST"
  | "RESOLVED_ACCEPTED"
  | "DEADLINE_PASSED"
  | "FAIL";

const OPEN: CaseState[] = [
  "NEW",
  "COLLECTING",
  "READY",
  "NEEDS_INFO",
  "APPROVED",
  "ERROR",
];
const ACTIVE: CaseState[] = [...OPEN, "SUBMITTED", "AWAITING_OUTCOME"];

const TRANSITIONS: Record<CaseEvent, { from: CaseState[]; to: CaseState }> = {
  COLLECT: {
    from: ["NEW", "NEEDS_INFO", "READY", "ERROR", "COLLECTING"],
    to: "COLLECTING",
  },
  COLLECTED_READY: { from: ["COLLECTING"], to: "READY" },
  COLLECTED_NEEDS_INFO: { from: ["COLLECTING"], to: "NEEDS_INFO" },
  APPROVE: { from: ["READY"], to: "APPROVED" },
  SUBMITTED: { from: ["APPROVED"], to: "SUBMITTED" },
  PAYPAL_REVIEWING: { from: ["SUBMITTED"], to: "AWAITING_OUTCOME" },
  RESOLVED_WON: { from: ["SUBMITTED", "AWAITING_OUTCOME"], to: "CLOSED_WON" },
  RESOLVED_LOST: { from: ["SUBMITTED", "AWAITING_OUTCOME"], to: "CLOSED_LOST" },
  RESOLVED_ACCEPTED: { from: ACTIVE, to: "CLOSED_ACCEPTED" },
  DEADLINE_PASSED: { from: OPEN, to: "EXPIRED" },
  FAIL: {
    from: ["COLLECTING", "APPROVED", "READY", "NEEDS_INFO", "NEW"],
    to: "ERROR",
  },
};

export class CaseTransitionError extends Error {
  override name = "CaseTransitionError";
  constructor(
    readonly from: CaseState,
    readonly event: CaseEvent,
  ) {
    super(`Case cannot go from ${from} on ${event}`);
  }
}

export function nextCaseState(from: CaseState, event: CaseEvent): CaseState {
  const t = TRANSITIONS[event];
  if (!t.from.includes(from)) throw new CaseTransitionError(from, event);
  return t.to;
}

export const canTransition = (from: CaseState, event: CaseEvent): boolean =>
  TRANSITIONS[event].from.includes(from);

export const isOpenCase = (s: CaseState): boolean => OPEN.includes(s);

/**
 * Maps re-fetched PayPal state onto a case event (never from webhook bodies alone).
 * RESOLVED with seller favour is a win; buyer favour after an accepted claim counts as accepted.
 */
export function paypalEvent(
  state: CaseState,
  paypalStatus: string,
  outcomeCode: string | undefined,
  acceptedClaim: boolean,
): CaseEvent | null {
  if (paypalStatus === "RESOLVED") {
    if (acceptedClaim)
      return canTransition(state, "RESOLVED_ACCEPTED")
        ? "RESOLVED_ACCEPTED"
        : null;
    if (outcomeCode === "RESOLVED_SELLER_FAVOUR")
      return canTransition(state, "RESOLVED_WON") ? "RESOLVED_WON" : null;
    if (canTransition(state, "RESOLVED_LOST")) return "RESOLVED_LOST";
    return canTransition(state, "RESOLVED_ACCEPTED")
      ? "RESOLVED_ACCEPTED"
      : null;
  }
  if (
    ["UNDER_REVIEW", "WAITING_FOR_BUYER_RESPONSE"].includes(paypalStatus) &&
    state === "SUBMITTED"
  ) {
    return "PAYPAL_REVIEWING";
  }
  return null;
}
