import { z } from "zod";
import { PaypalLink, PaypalMoney } from "./dispute-details.js";

// GET /v1/reporting/transactions (contract 4). Lenient subset; shapes confirmed by spike S6 (2026-10-18).
// Seller-side event codes seen: T0000 payment received, T1107 refund, T1110 dispute hold, T1111 hold release,
// T1900 sandbox funding. `paypal_reference_id_type` is `TXN` (the buyer's side) for non-Orders payments and
// `ODR` for Orders API payments.

export const PaypalProtectionEligibility = z.enum(["01", "02", "03"]);

export const PaypalTransactionDetail = z
  .object({
    transaction_info: z
      .object({
        transaction_id: z.string().min(1),
        transaction_event_code: z.string(),
        transaction_initiation_date: z.string(),
        transaction_amount: PaypalMoney,
        transaction_status: z.string(),
        protection_eligibility: PaypalProtectionEligibility.optional(),
        paypal_reference_id: z.string().optional(),
        paypal_reference_id_type: z.string().optional(),
        invoice_id: z.string().optional(),
        custom_field: z.string().optional(),
      })
      .loose(),
    shipping_info: z
      .object({
        name: z.string().optional(),
        address: z
          .object({
            postal_code: z.string().optional(),
            country_code: z.string().optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
    cart_info: z
      .object({
        item_details: z
          .array(z.object({ item_name: z.string().optional() }).loose())
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();
export type PaypalTransactionDetail = z.infer<typeof PaypalTransactionDetail>;

export const PaypalTransactionSearch = z
  .object({
    transaction_details: z.array(PaypalTransactionDetail).default([]),
    total_items: z.number().int(),
    total_pages: z.number().int(),
    page: z.number().int().optional(),
    last_refreshed_datetime: z.string().optional(),
    links: z.array(PaypalLink).optional(),
  })
  .loose();
export type PaypalTransactionSearch = z.infer<typeof PaypalTransactionSearch>;
