// Display helpers. Duplicates a few lines of @ds/core time/money formatting on purpose: the web app may
// not import @ds/core (AGENTS.md rule 9).

const EXP: Record<string, number> = { JPY: 0, HUF: 0, TWD: 0 };

export function formatMoney(minor: number, currency: string): string {
  const exp = EXP[currency] ?? 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(minor / 10 ** exp);
  } catch {
    return `${currency} ${(minor / 10 ** exp).toFixed(exp)}`;
  }
}

export type Band = "OK" | "SOON" | "URGENT" | "OVERDUE" | "NONE";

export function band(
  dueAt: string | null | undefined,
  now: number = Date.now(),
): Band {
  if (!dueAt) return "NONE";
  const h = (Date.parse(dueAt) - now) / 3_600_000;
  return h <= 0 ? "OVERDUE" : h < 24 ? "URGENT" : h < 72 ? "SOON" : "OK";
}

export function timeLeft(
  dueAt: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!dueAt) return "No deadline";
  const ms = Date.parse(dueAt) - now;
  if (ms <= 0) return "Overdue";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return m < 48 * 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${d} d ${h} h`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? iso
    : new Date(t).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export const REASONS: Record<string, string> = {
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

const title = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");
export const reasonLabel = (r: string) => REASONS[r] ?? title(r);
export const stageLabel = (s: string) => title(s);

export const STATE_LABELS: Record<string, string> = {
  NEW: "New",
  COLLECTING: "Collecting",
  READY: "Ready",
  NEEDS_INFO: "Needs info",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  AWAITING_OUTCOME: "Awaiting outcome",
  CLOSED_WON: "Won",
  CLOSED_LOST: "Lost",
  CLOSED_ACCEPTED: "Claim accepted",
  EXPIRED: "Expired",
  ERROR: "Error",
};
export const stateLabel = (s: string) => STATE_LABELS[s] ?? title(s);

export const ACTION_LABELS: Record<string, string> = {
  PROVIDE_EVIDENCE: "Fight",
  FIGHT: "Fight",
  ACCEPT_CLAIM: "Accept",
  ACCEPT: "Accept",
  MANUAL: "Review",
  REVIEW: "Review",
};
