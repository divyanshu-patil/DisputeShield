import type { Fact } from "@ds/schemas";
import type { AcceptClaimInput, AddTrackingInput } from "./gateway.js";
import type { EvidenceInput } from "./live/multipart.js";

// Deterministic submission payloads (05 section 7). The same builders feed dry-run snapshots and live sends.

const CARRIERS: Record<string, string> = {
  USPS: "USPS",
  "US POSTAL SERVICE": "USPS",
  UPS: "UPS",
  FEDEX: "FEDEX",
  "FED EX": "FEDEX",
  DHL: "DHL",
  "DHL EXPRESS": "DHL",
  "ROYAL MAIL": "ROYAL_MAIL",
  "CANADA POST": "CANADA_POST",
  "AUSTRALIA POST": "AUSTRALIA_POST",
  "INDIA POST": "INDIA_POST",
};

/**
 * Seller carrier text to a PayPal carrier code. Only USPS is confirmed (S3); `OTHER` was rejected in S3
 * as a dispute carrier, so unknown names are passed through upper-cased and PayPal's 400 surfaces them.
 */
export function normaliseCarrier(name: string): string {
  const key = name.trim().toUpperCase().replace(/\s+/g, " ");
  return CARRIERS[key] ?? key.replace(/[^A-Z0-9]+/g, "_");
}

const display = (facts: Fact[], key: string) =>
  facts.find((f) => f.key === key)?.display;

export class SubmissionBuildError extends Error {
  override name = "SubmissionBuildError";
}

export function buildProvideEvidence(
  evidenceType: "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND",
  facts: Fact[],
  notesText: string,
): EvidenceInput {
  if (evidenceType === "PROOF_OF_FULFILLMENT") {
    const number = display(facts, "tracking.number");
    const carrier = display(facts, "tracking.carrier");
    if (!number || !carrier)
      throw new SubmissionBuildError(
        "tracking number and carrier facts are required",
      );
    return {
      evidences: [
        {
          evidence_type: "PROOF_OF_FULFILLMENT",
          evidence_info: {
            tracking_info: [
              {
                carrier_name: normaliseCarrier(carrier),
                tracking_number: number,
              },
            ],
          },
          notes: notesText,
        },
      ],
    };
  }
  const refundId = display(facts, "refund.id");
  if (!refundId) throw new SubmissionBuildError("a refund ID fact is required");
  return {
    evidences: [
      {
        evidence_type: "PROOF_OF_REFUND",
        evidence_info: { refund_ids: [refundId] },
        notes: notesText,
      },
    ],
  };
}

export const ACCEPT_CLAIM_NOTE =
  "The seller accepts this claim and agrees to a full refund.";

export function buildAcceptClaim(comment?: string): AcceptClaimInput {
  const extra = comment?.trim();
  return {
    note: (extra ? `${ACCEPT_CLAIM_NOTE} ${extra}` : ACCEPT_CLAIM_NOTE).slice(
      0,
      2000,
    ),
    accept_claim_type: "REFUND",
  };
}

export function buildAddTracking(
  captureId: string,
  trackingNumber: string,
  carrier: string,
): AddTrackingInput {
  return {
    capture_id: captureId,
    tracking_number: trackingNumber,
    carrier: normaliseCarrier(carrier),
    notify_payer: false,
  };
}
