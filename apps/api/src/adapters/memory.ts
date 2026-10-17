import type { StudioTurnResponse } from "@ds/schemas";
import type { Deps, DisputeRow, EventStore, JobInput, JobQueue, StudioLlm, WebhookEventRecord, WebhookVerifier } from "../ports.js";

// In-memory adapters. They make the server runnable and testable before @ds/db and @ds/paypal exist.
// Replace each with the real adapter as its plan task lands (see container.ts). Never use in production.

export class MemoryEventStore implements EventStore {
  readonly events = new Map<string, WebhookEventRecord & { receivedAt: Date }>();
  constructor(private readonly clock: () => Date) {}

  async insert(event: WebhookEventRecord): Promise<"inserted" | "duplicate"> {
    if (this.events.has(event.id)) return "duplicate";
    this.events.set(event.id, { ...event, receivedAt: this.clock() });
    return "inserted";
  }

  async lastReceivedAt(): Promise<Date | null> {
    let latest: Date | null = null;
    for (const e of this.events.values()) if (!latest || e.receivedAt > latest) latest = e.receivedAt;
    return latest;
  }
}

export class MemoryJobQueue implements JobQueue {
  readonly queued: JobInput[] = [];
  readonly handlers = new Map<JobInput["kind"], (payload: Record<string, unknown>) => Promise<void>>();

  async enqueue(job: JobInput): Promise<void> {
    if (job.dedupeKey && this.queued.some((j) => j.dedupeKey === job.dedupeKey)) return;
    this.queued.push(job);
  }

  async runDue(opts: { budgetMs: number; now: Date }): Promise<{ ran: number; failed: number }> {
    const deadline = Date.now() + opts.budgetMs;
    let ran = 0;
    let failed = 0;
    while (this.queued.length > 0 && Date.now() < deadline) {
      const job = this.queued.shift();
      if (!job) break;
      const handler = this.handlers.get(job.kind);
      if (!handler) continue; // no handler wired yet: drop (skeleton only)
      try {
        await handler(job.payload);
        ran += 1;
      } catch {
        failed += 1;
      }
    }
    return { ran, failed };
  }
}

/**
 * Replay-mode verifier: accepts only the signature value used by the recorded fixtures.
 * Live mode must use the real verifier from @ds/paypal; until it is wired this fails closed.
 */
export class FixtureWebhookVerifier implements WebhookVerifier {
  static readonly VALID_SIGNATURE = "fixture-valid";
  constructor(private readonly mode: "live" | "replay") {}

  async verify(input: { headers: Record<string, string>; rawBody: string }): Promise<{ ok: boolean; detail: string }> {
    if (this.mode === "live") return { ok: false, detail: "live verifier not wired (use @ds/paypal verify-postback)" };
    return input.headers["paypal-transmission-sig"] === FixtureWebhookVerifier.VALID_SIGNATURE
      ? { ok: true, detail: "FIXTURE" }
      : { ok: false, detail: "FIXTURE_SIGNATURE_MISMATCH" };
  }
}

/** Used when no LLM key is configured. Honest about it instead of pretending to answer. */
export class ReplayStudioLlm implements StudioLlm {
  async turn(): Promise<StudioTurnResponse> {
    return {
      id: "replay",
      createdAt: Date.now(),
      status: "completed",
      model: "replay",
      output: [
        {
          id: "replay-msg",
          kind: "output",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "text",
              text: "No language model is connected in this deployment (replay mode). Set OLLAMA_API_KEY and LLM_MODEL on the API to enable the dispute analyst. The dashboard and its data still work.",
              annotations: [],
            },
          ],
        },
      ],
    };
  }
  async status(): Promise<"not_configured"> {
    return "not_configured";
  }
}

export function demoDisputes(): DisputeRow[] {
  return [
    { id: "DS-001", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", paypalStatus: "WAITING_FOR_SELLER_RESPONSE", stage: "INQUIRY", amountMinor: 4800, currency: "USD", sellerResponseDue: null, caseState: "NEW" },
    { id: "DS-002", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", paypalStatus: "WAITING_FOR_SELLER_RESPONSE", stage: "INQUIRY", amountMinor: 12900, currency: "USD", sellerResponseDue: null, caseState: "NEW" },
  ];
}

export function buildMemoryDeps(mode: "live" | "replay", clock: () => Date = () => new Date()): Deps {
  const rows = demoDisputes();
  return {
    events: new MemoryEventStore(clock),
    verifier: new FixtureWebhookVerifier(mode),
    jobs: new MemoryJobQueue(),
    disputes: {
      async list({ caseState, limit }) {
        return rows.filter((r) => !caseState || r.caseState === caseState).slice(0, limit);
      },
      async get(id) {
        return rows.find((r) => r.id === id) ?? null;
      },
    },
    health: {
      async database() {
        return "not_configured";
      },
      async lastSyncAt() {
        return null;
      },
    },
    studioLlm: new ReplayStudioLlm(),
    clock,
  };
}
