import { z } from "zod";
import { DisputeCore, PaypalLink } from "./dispute-details.js";

// GET /v1/customer/disputes (contract 2.1). Items carry the core fields; details need a second call.
export const PaypalDisputeList = z
  .object({
    items: z.array(z.object(DisputeCore).loose()).default([]),
    links: z.array(PaypalLink).optional(),
  })
  .loose();
export type PaypalDisputeList = z.infer<typeof PaypalDisputeList>;
