import { z } from "zod";

// Prevent module (05-evidence-engine-spec.md section 8; 04-data-model.md section 2.10).

export const RiskRule = z.enum(["R-PROT", "R-ADDR", "R-NOTRACK", "R-STUCK"]);
export type RiskRule = z.infer<typeof RiskRule>;

export const Severity = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type Severity = z.infer<typeof Severity>;

export const RiskStatus = z.enum([
  "OPEN",
  "ACTIONED",
  "DISMISSED",
  "AUTO_CLEARED",
]);
export type RiskStatus = z.infer<typeof RiskStatus>;

export const SuggestedAction = z.enum(["ADD_TRACKING", "REFUND", "REVIEW"]);
export type SuggestedAction = z.infer<typeof SuggestedAction>;

/** Assumptions, not PayPal rules; editable on Setup (AC-RISK-06). */
export const RiskThresholds = z.object({
  noTrackingAfterHours: z.number().int().min(1).max(720),
  stuckTrackingDays: z.number().int().min(1).max(60),
  highValueMinor: z.number().int().min(0),
});
export type RiskThresholds = z.infer<typeof RiskThresholds>;

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  noTrackingAfterHours: 48,
  stuckTrackingDays: 7,
  highValueMinor: 10_000,
};

export const RiskFinding = z.object({
  rule: RiskRule,
  severity: Severity,
  reason: z.string(),
  factRefs: z.record(z.string(), z.string()),
  suggestedAction: SuggestedAction,
});
export type RiskFinding = z.infer<typeof RiskFinding>;
