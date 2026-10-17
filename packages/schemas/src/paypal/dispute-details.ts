import { z } from "zod";

// Lenient subsets of the Disputes API payloads (docs/03-paypal-api-contract.md 2.1, 2.2).
// Only fields we read are validated; unknown keys pass through. Shapes confirmed by spike S2 (2026-10-17).

export const PaypalMoney = z
  .object({ currency_code: z.string().length(3), value: z.string() })
  .loose();

export const PaypalLink = z
  .object({ href: z.string(), rel: z.string(), method: z.string() })
  .loose();

export const PaypalDisputeStatus = z.enum([
  "OPEN",
  "WAITING_FOR_SELLER_RESPONSE",
  "WAITING_FOR_BUYER_RESPONSE",
  "UNDER_REVIEW",
  "RESOLVED",
]);

export const PaypalLifeCycleStage = z.enum([
  "INQUIRY",
  "CHARGEBACK",
  "PRE_ARBITRATION",
  "ARBITRATION",
]);

export const DisputeCore = {
  dispute_id: z.string().min(1),
  reason: z.string(),
  status: PaypalDisputeStatus,
  dispute_state: z.string().optional(),
  dispute_life_cycle_stage: PaypalLifeCycleStage.optional(),
  dispute_amount: PaypalMoney,
  seller_response_due_date: z.string().optional(),
  create_time: z.string(),
  update_time: z.string(),
  links: z.array(PaypalLink),
};

export const PaypalDisputedTransaction = z
  .object({
    buyer_transaction_id: z.string().optional(),
    seller_transaction_id: z.string().optional(),
    create_time: z.string().optional(),
    transaction_status: z.string().optional(),
    gross_amount: PaypalMoney.optional(),
    items: z
      .array(
        z
          .object({
            item_name: z.string().optional(),
            item_quantity: z.string().optional(),
            item_type: z.string().optional(),
            reason: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

export const PaypalDisputeDetails = z
  .object({
    ...DisputeCore,
    disputed_transactions: z.array(PaypalDisputedTransaction).min(1),
    allowed_response_options: z.record(z.string(), z.unknown()).optional(),
    evidences: z
      .array(
        z
          .object({ evidence_type: z.string(), date: z.string().optional() })
          .loose(),
      )
      .optional(),
    messages: z
      .array(
        z
          .object({
            posted_by: z.string(),
            time_posted: z.string(),
            content: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();
export type PaypalDisputeDetails = z.infer<typeof PaypalDisputeDetails>;
