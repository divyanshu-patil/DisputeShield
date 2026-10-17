import { JobPayloads, type JobKind, type JobPayload, type JobResult } from "./kinds.js";

export class JobNotImplementedError extends Error {
  constructor(public readonly kind: JobKind) {
    super(`No handler is registered for job "${kind}" yet`);
    this.name = "JobNotImplementedError";
  }
}

export class JobPayloadError extends Error {
  constructor(
    public readonly kind: JobKind,
    public readonly issues: string[],
  ) {
    super(`Invalid payload for job "${kind}": ${issues.join("; ")}`);
    this.name = "JobPayloadError";
  }
}

export type JobContext = {
  /** Identifies the attempt in logs. Postgres: the job row id. Render: the task run id. */
  runId?: string;
  signal?: AbortSignal;
};

export type JobHandlers = {
  [K in JobKind]?: (payload: JobPayload<K>, ctx: JobContext) => Promise<JobResult<K>>;
};

export interface JobRunner {
  /** Validate the payload, run the handler, return its result. Throws on failure so the backend retries. */
  run<K extends JobKind>(kind: K, payload: unknown, ctx?: JobContext): Promise<JobResult<K>>;
  has(kind: JobKind): boolean;
}

/**
 * The single dispatch point for background work. The Postgres worker and the Render Workflows tasks
 * both call `run`, so retries, validation and (later) handlers behave the same on either backend.
 */
export function createJobRunner(handlers: JobHandlers): JobRunner {
  return {
    has: (kind) => handlers[kind] !== undefined,
    async run(kind, payload, ctx = {}) {
      const parsed = JobPayloads[kind].safeParse(payload ?? {});
      if (!parsed.success) {
        throw new JobPayloadError(
          kind,
          parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
        );
      }
      const handler = handlers[kind] as ((p: unknown, c: JobContext) => Promise<unknown>) | undefined;
      if (!handler) throw new JobNotImplementedError(kind);
      return (await handler(parsed.data, ctx)) as JobResult<typeof kind>;
    },
  };
}
