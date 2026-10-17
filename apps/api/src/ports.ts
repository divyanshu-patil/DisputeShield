import type { PostgresJobQueue, Repos } from "@ds/db";
import type { Pipeline } from "@ds/pipeline";
import type { StudioTurnRequest, StudioTurnResponse } from "@ds/schemas";

// Ports the HTTP layer depends on. Real implementations come from @ds/db, @ds/paypal and
// @ds/agent (see container.ts). Tests and the first runnable server use in-memory adapters.
// Keep these small: route handlers translate HTTP to a port call, nothing more.

export type WebhookEventRecord = {
  id: string; // PayPal event id (WH-...), also the idempotency key
  eventType: string;
  resourceId: string | null;
  verified: boolean;
  verificationDetail: string;
  headers: Record<string, string>; // the five PayPal headers only
  bodyRaw: string; // exact bytes as received, UTF-8
};

export interface EventStore {
  /** Atomic insert. Returns "duplicate" if the event id already exists. */
  insert(event: WebhookEventRecord): Promise<"inserted" | "duplicate">;
  lastReceivedAt(): Promise<Date | null>;
}

export interface WebhookVerifier {
  verify(input: { headers: Record<string, string>; rawBody: string }): Promise<{ ok: boolean; detail: string }>;
}

export type JobInput = {
  kind: "sync_disputes" | "sync_dispute" | "collect_case" | "draft_case" | "scan_transactions" | "record_fixture";
  payload: Record<string, unknown>;
  dedupeKey?: string;
};

export interface JobQueue {
  enqueue(job: JobInput): Promise<void>;
  /** Claim and run due jobs until the budget is spent. Must never run a job twice concurrently. */
  runDue(opts: { budgetMs: number; now: Date }): Promise<{ ran: number; failed: number }>;
}

// Minimal row for the queue API. Replace with the Dispute type from @ds/schemas when it exists.
export type DisputeRow = {
  id: string;
  reason: string;
  paypalStatus: string;
  stage: string;
  amountMinor: number;
  currency: string;
  sellerResponseDue: string | null;
  caseState: string;
  caseId?: string | null;
  strength?: string | null;
  recommendedAction?: string | null;
  allowedActions?: string[];
  disputedTransactionId?: string | null;
  createdAtPaypal?: string | null;
};

export interface DisputeReader {
  list(filter: { caseState?: string; limit: number }): Promise<DisputeRow[]>;
  get(id: string): Promise<DisputeRow | null>;
}

export interface HealthProbe {
  database(): Promise<"ok" | "down" | "not_configured">;
  lastSyncAt(): Promise<Date | null>;
}

export interface StudioLlm {
  /** One AG Studio agent turn. Throws LlmError subclasses from @ds/agent on provider failures. */
  turn(req: StudioTurnRequest, opts?: { signal?: AbortSignal }): Promise<StudioTurnResponse>;
  /** Cheap, cached reachability check for /api/health. */
  status(): Promise<"ok" | "down" | "not_configured">;
}

/** Database-backed case services. Absent with the in-memory adapters (no DATABASE_URL): those routes answer 501. */
export type Services = {
  pipeline: Pipeline;
  repos: Repos;
  queue: PostgresJobQueue | null;
  /** Demo CSV for the Fulfilment page (replay scenarios, dates relative to now). */
  sampleCsv: () => string;
  seed: () => Promise<unknown>;
  /** Run due jobs soon instead of waiting for the next worker tick. */
  kick: () => void;
};

export type Deps = {
  events: EventStore;
  verifier: WebhookVerifier;
  jobs: JobQueue;
  disputes: DisputeReader;
  health: HealthProbe;
  studioLlm: StudioLlm;
  clock: () => Date;
  services?: Services;
};
