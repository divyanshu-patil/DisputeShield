import type { JobInput, JobQueue } from "../ports.js";

/**
 * JobQueue backed by Render Workflows ✅ (SDK 1.2.0). `enqueue` starts a task run named
 * `<workflow-slug>/<job kind>`; Render owns retries, per-run compute and run history, so `runDue`
 * has nothing to do and the inline worker / cron tick become no-ops on this backend.
 */

export type StartTask = (
  taskSlug: string,
  args: unknown[],
  options: { idempotencyKey: string },
) => Promise<{ taskRunId?: string }>;

export type RenderQueueOptions = {
  workflowSlug: string;
  startTask: StartTask;
  clock: () => Date;
  /** Jobs without a dedupeKey that arrive within one bucket are treated as the same request. Default 5 min. */
  bucketMs?: number;
  onError?: (err: unknown, job: JobInput) => void;
};

export class RenderJobQueue implements JobQueue {
  readonly #opts: Required<Omit<RenderQueueOptions, "onError">> & Pick<RenderQueueOptions, "onError">;

  constructor(opts: RenderQueueOptions) {
    this.#opts = { bucketMs: 300_000, ...opts };
  }

  async enqueue(job: JobInput): Promise<void> {
    const key = idempotencyKey(job, this.#opts.clock().getTime(), this.#opts.bucketMs);
    try {
      await this.#opts.startTask(`${this.#opts.workflowSlug}/${job.kind}`, [job.payload], { idempotencyKey: key });
    } catch (err) {
      this.#opts.onError?.(err, job);
      throw err;
    }
  }

  async runDue(): Promise<{ ran: number; failed: number }> {
    return { ran: 0, failed: 0 };
  }
}

/**
 * Render de-duplicates identical keys for 24 h ✅. A key that never changed would swallow every later
 * sync after the first, so keys without an explicit dedupeKey carry a time bucket. Webhook-driven jobs
 * pass their event id as dedupeKey and are therefore once-only, which is what idempotent delivery needs.
 */
export function idempotencyKey(job: JobInput, nowMs: number, bucketMs: number): string {
  const suffix = job.dedupeKey ?? `t${Math.floor(nowMs / bucketMs)}:${stablePayload(job.payload)}`;
  // Render's key length limit is not documented ❓; keep it short.
  return `${job.kind}:${suffix}`.slice(0, 200);
}

function stablePayload(payload: Record<string, unknown>): string {
  return Object.keys(payload)
    .sort()
    .map((k) => `${k}=${String(payload[k])}`)
    .join("&");
}
