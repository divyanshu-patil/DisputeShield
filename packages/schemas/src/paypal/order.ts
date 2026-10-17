import { z } from "zod";
import { PaypalLink, PaypalMoney } from "./dispute-details.js";

// GET /v2/checkout/orders/{id} (contract 5). Lenient subset: the capture, refund and tracker paths that
// extract-order.ts reads. Paths confirmed by spikes S7/S8 (2026-10-18).

const Status = z.object({ id: z.string().min(1), status: z.string() }).loose();

export const PaypalOrder = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    intent: z.string().optional(),
    purchase_units: z
      .array(
        z
          .object({
            reference_id: z.string().optional(),
            invoice_id: z.string().optional(),
            amount: PaypalMoney.optional(),
            items: z.array(z.object({ name: z.string() }).loose()).optional(),
            shipping: z
              .object({
                address: z
                  .object({
                    postal_code: z.string().optional(),
                    country_code: z.string().optional(),
                  })
                  .loose()
                  .optional(),
                trackers: z.array(Status).optional(),
              })
              .loose()
              .optional(),
            payments: z
              .object({
                captures: z
                  .array(Status.extend({ amount: PaypalMoney.optional() }))
                  .optional(),
                refunds: z
                  .array(Status.extend({ amount: PaypalMoney.optional() }))
                  .optional(),
              })
              .loose()
              .optional(),
          })
          .loose(),
      )
      .default([]),
    links: z.array(PaypalLink).default([]),
  })
  .loose();
export type PaypalOrder = z.infer<typeof PaypalOrder>;
