// Submission states (04-data-model.md section 4). FAILED never auto-retries.
export type SubmissionStatus = "PENDING" | "SENT" | "DRY_RUN_STORED" | "FAILED";

const NEXT: Record<SubmissionStatus, SubmissionStatus[]> = {
  PENDING: ["SENT", "DRY_RUN_STORED", "FAILED"],
  SENT: [],
  DRY_RUN_STORED: [],
  FAILED: [],
};

export const canSubmissionMove = (
  from: SubmissionStatus,
  to: SubmissionStatus,
): boolean => NEXT[from].includes(to);
