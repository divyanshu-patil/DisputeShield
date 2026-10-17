import type { EvidenceDraft, EvidenceStatement, Fact } from "@ds/schemas";
import type { Assessment } from "../checklist/checklist.js";

// Model-free evidence sentences built only from facts (05 section 4.4). Used when the model is missing,
// times out or fails twice. Every sentence copies fact displays verbatim, so it passes the verifier.

export function fallbackDraft(a: Assessment, facts: Fact[]): EvidenceDraft {
  const f = new Map(facts.map((x) => [x.key, x]));
  const d = (k: string) => f.get(k)?.display;
  const csv = (k: string) => f.get(k)?.confidence === "SELLER_UPLOAD";
  const statements: EvidenceStatement[] = [];
  const say = (text: string, factKeys: string[]) => {
    if (factKeys.every((k) => f.has(k))) statements.push({ text, factKeys });
  };
  const source = (k: string) =>
    csv(k) ? " per the seller's fulfilment records" : "";

  if (a.kind === "INR") {
    say(
      `Tracking number ${d("tracking.number")} with carrier ${d("tracking.carrier")} was recorded for this order${source("tracking.number")}.`,
      ["tracking.carrier", "tracking.number"],
    );
    if (d("tracking.on_paypal") === "Yes")
      say("The tracking number was added to the PayPal order.", [
        "tracking.on_paypal",
      ]);
    say(
      `The package was shipped on ${d("fulfil.shipped_at")}${source("fulfil.shipped_at")}, before the dispute was opened on ${d("dispute.opened_at")}.`,
      ["fulfil.shipped_at", "dispute.opened_at"],
    );
    say(
      `The package was delivered on ${d("fulfil.delivered_at")}${source("fulfil.delivered_at")}.`,
      ["fulfil.delivered_at"],
    );
    if (d("derived.ship_address_match") === "Yes") {
      const postal = f.has("fulfil.ship_to.postal_code")
        ? "fulfil.ship_to.postal_code"
        : "txn.ship_to.postal_code";
      say(
        `It was sent to postal code ${d(postal)}, which matches the address on the order.`,
        [postal, "derived.ship_address_match"],
      );
    }
    say(
      `The payment of ${d("txn.amount")} on ${d("txn.date")} has transaction ID ${d("txn.id")}.`,
      ["txn.amount", "txn.date", "txn.id"],
    );
  } else if (a.kind === "REFUND") {
    say(
      `A refund of ${d("refund.amount")} was issued on ${d("refund.date")} with refund ID ${d("refund.id")}.`,
      ["refund.amount", "refund.date", "refund.id"],
    );
    if (!f.has("refund.date"))
      say(
        `A refund of ${d("refund.amount")} was issued with refund ID ${d("refund.id")}.`,
        ["refund.amount", "refund.id"],
      );
    say(`The disputed amount is ${d("dispute.amount")}.`, ["dispute.amount"]);
  }
  const blocked = a.checklist.some((c) => c.blocking && c.status !== "MET");
  return {
    evidenceType: a.evidenceType ?? "OTHER",
    statements: blocked ? [] : statements.slice(0, 8),
    recommendation: {
      action: blocked || a.kind === "GENERIC" ? "REVIEW" : "FIGHT",
      rationale: blocked ? [] : statements.slice(0, 1),
    },
  };
}
