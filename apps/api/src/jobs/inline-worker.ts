import type { JobQueue } from "../ports.js";

export type InlineWorker = { stop: () => Promise<void> };

type Logger = { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };

/**
 * Runs due jobs inside this process on a timer. One run at a time (no overlap).
 * `stop()` waits for a run in flight, so shutdown never abandons a job half way.
 */
export function startInlineWorker(opts: {
  jobs: JobQueue;
  intervalMs: number;
  budgetMs: number;
  clock: () => Date;
  log: Logger;
}): InlineWorker {
  let stopped = false;
  let running: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const tick = (): void => {
    if (stopped || running) return;
    running = opts.jobs
      .runDue({ budgetMs: opts.budgetMs, now: opts.clock() })
      .then((r) => {
        if (r.ran > 0 || r.failed > 0) opts.log.info(r, "inline worker tick");
      })
      .catch((err: unknown) => opts.log.error({ err }, "inline worker tick failed"))
      .finally(() => {
        running = null;
      });
  };

  timer = setInterval(tick, opts.intervalMs);
  timer.unref();

  return {
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (running) await running;
    },
  };
}
