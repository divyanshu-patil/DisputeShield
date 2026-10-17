import { type JobKind, type JobRunner, isJobKind } from "@ds/jobs";
import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

// Postgres job queue (04 section 2.12): claim with FOR UPDATE SKIP LOCKED, exponential backoff
// (2^attempts minutes, capped at 30), DEAD after max_attempts, reaper for RUNNING > 10 minutes.

export type EnqueueInput = {
  kind: JobKind;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  runAt?: Date;
};

type Claimed = {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

export const backoffMinutes = (attempts: number): number =>
  Math.min(2 ** attempts, 30);

/** Errors may carry a provider Retry-After (PayPal 429, AC-SYNC-09). */
const retryAfterSeconds = (err: unknown): number | null => {
  const v = (err as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  return typeof v === "number" && v > 0 ? v : null;
};

export class PostgresJobQueue {
  constructor(
    private readonly db: Db,
    private readonly runner: JobRunner,
    private readonly log: (
      msg: string,
      extra?: Record<string, unknown>,
    ) => void = () => {},
  ) {}

  async enqueue(job: EnqueueInput): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO jobs (kind, payload, dedupe_key, run_at)
      VALUES (${job.kind}, ${JSON.stringify(job.payload)}::jsonb, ${job.dedupeKey ?? null}, ${(job.runAt ?? new Date()).toISOString()})
      ON CONFLICT (dedupe_key) WHERE status IN ('QUEUED','RUNNING') DO NOTHING`);
  }

  async claim(limit: number, now: Date): Promise<Claimed[]> {
    const rows = await this.db.execute(sql`
      UPDATE jobs SET status = 'RUNNING', locked_at = ${now.toISOString()}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'QUEUED' AND backend = 'postgres' AND run_at <= ${now.toISOString()}
        ORDER BY run_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING id, kind, payload, attempts, max_attempts`);
    return rows as unknown as Claimed[];
  }

  /** Requeues RUNNING jobs locked more than 10 minutes ago (AC-SYNC-05). */
  async reap(now: Date): Promise<number> {
    const rows = await this.db.execute(sql`
      UPDATE jobs SET status = 'QUEUED', locked_at = NULL, last_error = 'reaped after 10 minutes RUNNING'
      WHERE status = 'RUNNING' AND locked_at < ${new Date(now.getTime() - 10 * 60_000).toISOString()}
      RETURNING id`);
    return (rows as unknown as unknown[]).length;
  }

  async runDue(opts: {
    budgetMs: number;
    now: Date;
  }): Promise<{ ran: number; failed: number }> {
    const deadline = Date.now() + opts.budgetMs;
    let ran = 0;
    let failed = 0;
    await this.reap(opts.now);
    while (Date.now() < deadline) {
      const [job] = await this.claim(
        1,
        new Date(Math.max(opts.now.getTime(), Date.now())),
      );
      if (!job) break;
      try {
        if (!isJobKind(job.kind))
          throw new Error(`unknown job kind ${job.kind}`);
        await this.runner.run(job.kind, job.payload, { runId: job.id });
        await this.db.execute(
          sql`UPDATE jobs SET status = 'DONE', finished_at = now(), locked_at = NULL, last_error = NULL WHERE id = ${job.id}`,
        );
        ran++;
      } catch (err) {
        failed++;
        await this.fail(job, err);
      }
    }
    return { ran, failed };
  }

  private async fail(job: Claimed, err: unknown): Promise<void> {
    const message = (
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    ).slice(0, 500);
    this.log("job failed", {
      jobId: job.id,
      kind: job.kind,
      attempts: job.attempts,
      error: message,
    });
    if (job.attempts >= job.max_attempts) {
      await this.db.execute(
        sql`UPDATE jobs SET status = 'DEAD', finished_at = now(), locked_at = NULL, last_error = ${message} WHERE id = ${job.id}`,
      );
      return;
    }
    const delayMs =
      (retryAfterSeconds(err) ?? backoffMinutes(job.attempts) * 60) * 1000;
    await this.db.execute(sql`
      UPDATE jobs SET status = 'QUEUED', locked_at = NULL, last_error = ${message},
        run_at = now() + ${`${Math.round(delayMs)} milliseconds`}::interval
      WHERE id = ${job.id}`);
  }

  /** Recent jobs for the Setup page (errors visible, AC-SYNC-04). */
  async recent(limit = 50) {
    const rows = await this.db.execute(sql`
      SELECT id, kind, status, attempts, max_attempts, run_at, last_error, created_at, finished_at
      FROM jobs ORDER BY created_at DESC LIMIT ${limit}`);
    return rows as unknown as Record<string, unknown>[];
  }
}
