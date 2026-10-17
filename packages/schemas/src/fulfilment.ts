import { z } from "zod";

// Seller fulfilment CSV (05-evidence-engine-spec.md section 2.4). Header order is fixed.

export const FULFILMENT_COLUMNS = [
  "order_ref",
  "paypal_transaction_id",
  "carrier",
  "tracking_number",
  "shipped_at",
  "delivered_at",
  "last_scan_at",
  "ship_to_name",
  "ship_to_line1",
  "ship_to_city",
  "ship_to_postal",
  "ship_to_country",
] as const;

const isoDate = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    "must be an ISO 8601 date",
  )
  .refine((s) => !Number.isNaN(Date.parse(s)), "is not a real date");
const optional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), s.optional());

export const FulfilmentCsvRow = z.object({
  order_ref: z.string().min(1, "is required"),
  paypal_transaction_id: z
    .string()
    .regex(/^[A-Za-z0-9-]{6,64}$/, "must be a PayPal transaction ID"),
  carrier: optional(z.string().max(64)),
  tracking_number: optional(z.string().max(64)),
  shipped_at: optional(isoDate),
  delivered_at: optional(isoDate),
  last_scan_at: optional(isoDate),
  ship_to_name: optional(z.string().max(200)),
  ship_to_line1: optional(z.string().max(300)),
  ship_to_city: optional(z.string().max(100)),
  ship_to_postal: optional(z.string().max(20)),
  ship_to_country: optional(z.string().length(2)),
});
export type FulfilmentCsvRow = z.infer<typeof FulfilmentCsvRow>;

export const FulfilmentRecord = z.object({
  orderRef: z.string(),
  paypalTransactionId: z.string(),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  shippedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  lastScanAt: z.string().nullable(),
  shipToPostal: z.string().nullable(),
  shipToCountry: z.string().nullable(),
});
export type FulfilmentRecord = z.infer<typeof FulfilmentRecord>;
