import { z } from "zod";
import { DraftAction, EvidenceType } from "./evidence.js";

// 05-evidence-engine-spec.md sections 3 and 6.

export const Strength = z.enum(["STRONG", "MEDIUM", "WEAK"]);
export type Strength = z.infer<typeof Strength>;

export const ChecklistStatus = z.enum([
  "MET",
  "MISSING",
  "CONFLICT",
  "NOT_APPLICABLE",
]);
export type ChecklistStatus = z.infer<typeof ChecklistStatus>;

export const ChecklistItem = z.object({
  key: z.string(),
  label: z.string(),
  status: ChecklistStatus,
  blocking: z.boolean(),
  factKeys: z.array(z.string()),
  /** Plain-language fix shown when the item is not met. */
  fix: z.string().optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const RecommendedAction = z.enum([
  "PROVIDE_EVIDENCE",
  "ACCEPT_CLAIM",
  "MANUAL",
]);
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const DeadlineBand = z.enum(["OK", "SOON", "URGENT", "OVERDUE"]);
export type DeadlineBand = z.infer<typeof DeadlineBand>;

export const Money = z.object({
  currency: z.string().length(3),
  minor: z.number().int(),
});
export type Money = z.infer<typeof Money>;

export const DecisionAid = z.object({
  recommended: DraftAction,
  evidenceType: EvidenceType.nullable(),
  because: z.array(z.string()),
  amountAtRisk: Money,
  costOfFighting: z.string(),
  deadline: z.object({
    dueAt: z.string().nullable(),
    hoursLeft: z.number().nullable(),
    band: DeadlineBand,
  }),
  blockers: z.array(z.string()),
});
export type DecisionAid = z.infer<typeof DecisionAid>;
