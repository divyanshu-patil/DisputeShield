import { z } from "zod";

// One definition of "what a job is", shared by every backend: the Postgres queue (inline worker or
// cron tick) and Render Workflows tasks. Payloads are small and JSON-serialisable (Render limits
// task arguments to 4 MB per run ✅), and they carry ids, never data: handlers re-read state.

export const JobPayloads = {
  sync_disputes: z.object({}).strict(),
  sync_dispute: z.object({ disputeId: z.string().min(1).max(100), eventId: z.string().max(100).optional() }).strict(),
  collect_case: z.object({ disputeId: z.string().min(1).max(100) }).strict(),
  draft_case: z.object({ caseId: z.string().min(1).max(100) }).strict(),
  scan_transactions: z.object({ sinceDays: z.number().int().min(1).max(30).default(7) }).strict(),
  record_fixture: z.object({ operation: z.string().min(1).max(100), scenario: z.string().min(1).max(100) }).strict(),
} as const;

export type JobKind = keyof typeof JobPayloads;
export const JOB_KINDS = Object.keys(JobPayloads) as JobKind[];

export type JobPayload<K extends JobKind> = z.output<(typeof JobPayloads)[K]>;
export type JobPayloadInput<K extends JobKind> = z.input<(typeof JobPayloads)[K]>;

/** What a handler may return. Kept JSON-serialisable so Render can hand it to the next task. */
export type JobResults = {
  sync_disputes: { synced: number };
  sync_dispute: { caseId: string | null };
  collect_case: { caseId: string; state: string };
  draft_case: { draftId: string; verifierPassed: boolean };
  scan_transactions: { flagged: number };
  record_fixture: { path: string };
};
export type JobResult<K extends JobKind> = JobResults[K];

export function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as string[]).includes(value);
}
