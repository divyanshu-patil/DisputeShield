import { z } from "zod";

// Normalised dispute and case shapes (04-data-model.md sections 2.3, 2.4 and 3).

export const CaseState = z.enum([
  "NEW",
  "COLLECTING",
  "READY",
  "NEEDS_INFO",
  "APPROVED",
  "SUBMITTED",
  "AWAITING_OUTCOME",
  "CLOSED_WON",
  "CLOSED_LOST",
  "CLOSED_ACCEPTED",
  "EXPIRED",
  "ERROR",
]);
export type CaseState = z.infer<typeof CaseState>;

export const OPEN_CASE_STATES: readonly CaseState[] = [
  "NEW",
  "COLLECTING",
  "READY",
  "NEEDS_INFO",
  "APPROVED",
  "ERROR",
];

/** Seller actions derived from HATEOAS links (contract 2.2: rels use underscores). */
export const SellerAction = z.enum([
  "provide_evidence",
  "accept_claim",
  "make_offer",
  "send_message",
  "escalate",
  "acknowledge_return_item",
]);
export type SellerAction = z.infer<typeof SellerAction>;

export const Dispute = z.object({
  id: z.string(),
  reason: z.string(),
  paypalStatus: z.string(),
  disputeState: z.string().nullable(),
  stage: z.string(),
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  disputedTransactionId: z.string().nullable(),
  createdAtPaypal: z.string().nullable(),
  updatedAtPaypal: z.string().nullable(),
  sellerResponseDue: z.string().nullable(),
  allowedActions: z.array(z.string()),
});
export type Dispute = z.infer<typeof Dispute>;
