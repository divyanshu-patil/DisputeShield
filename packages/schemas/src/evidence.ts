import { z } from "zod";

// architecture.md section 6; 05-evidence-engine-spec.md sections 4 and 5.

export const EvidenceType = z.enum([
  "PROOF_OF_FULFILLMENT",
  "PROOF_OF_REFUND",
  "OTHER",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const EvidenceStatement = z.object({
  text: z.string(),
  factKeys: z.array(z.string()),
});
export type EvidenceStatement = z.infer<typeof EvidenceStatement>;

export const DraftAction = z.enum(["FIGHT", "ACCEPT", "REVIEW"]);
export type DraftAction = z.infer<typeof DraftAction>;

export const EvidenceDraft = z.object({
  evidenceType: EvidenceType,
  statements: z.array(EvidenceStatement),
  recommendation: z.object({
    action: DraftAction,
    rationale: z.array(EvidenceStatement),
  }),
});
export type EvidenceDraft = z.infer<typeof EvidenceDraft>;

export const RejectReason = z.enum([
  "NO_CITATION",
  "UNKNOWN_FACT",
  "VALUE_MISMATCH",
  "TOO_LONG",
]);
export type RejectReason = z.infer<typeof RejectReason>;

export const CitationEntry = z.object({
  factKey: z.string(),
  label: z.string(),
  display: z.string(),
  payloadId: z.string(),
  jsonPath: z.string(),
});

export const VerifierReport = z.object({
  accepted: z.array(EvidenceStatement),
  rejected: z.array(
    z.object({
      statement: EvidenceStatement,
      reason: RejectReason,
      detail: z.string().optional(),
    }),
  ),
  notesText: z.string().max(2000),
  citationAppendix: z.array(CitationEntry),
});
export type VerifierReport = z.infer<typeof VerifierReport>;

export const DraftOrigin = z.enum([
  "MODEL",
  "MODEL_REPAIRED",
  "TEMPLATE_FALLBACK",
  "HUMAN_EDIT",
  "RECORDED_MODEL",
]);
export type DraftOrigin = z.infer<typeof DraftOrigin>;
