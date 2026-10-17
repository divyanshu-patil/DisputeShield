import { z } from "zod";

// architecture.md section 6 and 05-evidence-engine-spec.md section 2. `display` is the exact string the
// verifier compares against: built once in the extractor, never reformatted later.

export const FactConfidence = z.enum(["PAYPAL", "SELLER_UPLOAD", "DERIVED"]);
export type FactConfidence = z.infer<typeof FactConfidence>;

export const FactValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const Fact = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: FactValue,
  display: z.string(),
  sourcePayloadId: z.string(),
  /** Path inside the stored raw payload; for derived facts, a comma list of input fact keys. */
  jsonPath: z.string(),
  fetchedAt: z.string(),
  confidence: FactConfidence,
});
export type Fact = z.infer<typeof Fact>;
