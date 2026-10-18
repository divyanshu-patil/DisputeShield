import {
  type Source,
  extractDispute,
  extractOrder,
  extractTracker,
  extractTransaction,
} from "@ds/core";
import {
  type Fact,
  PaypalDisputeDetails,
  PaypalOrder,
  PaypalTransactionSearch,
} from "@ds/schemas";
import type { OllamaTool } from "../llm/types.js";
import type { PaypalReadTools } from "./toolkit.js";

// AC-AI-03 (architecture 5.6): every copilot tool result is stored as a raw payload and turned into
// facts by the same extractors the case file uses. The model only ever sees those facts, never the
// PayPal JSON (AGENTS.md rule 2), so buyer details stay out of the prompt.

export type StorePayload = (
  source: string,
  ref: string,
  body: unknown,
) => Promise<string>;

export type CopilotTool = {
  def: OllamaTool;
  run(args: Record<string, unknown>): Promise<Fact[]>;
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Picks the payload to store and the facts in it, per tool. Unknown shapes store the body, no facts. */
function extract(
  name: string,
  args: Record<string, unknown>,
  body: unknown,
): { ref: string; payload: unknown; facts: (src: Source) => Fact[] } {
  const none = { ref: name, payload: body, facts: () => [] };
  if (name === "get_dispute") {
    const d = PaypalDisputeDetails.safeParse(body);
    return d.success
      ? {
          ref: d.data.dispute_id,
          payload: body,
          facts: (src) => extractDispute(d.data, src),
        }
      : none;
  }
  if (name === "get_order") {
    const o = PaypalOrder.safeParse(body);
    return o.success
      ? {
          ref: o.data.id,
          payload: body,
          facts: (src) => extractOrder(o.data, src),
        }
      : none;
  }
  if (name === "list_transactions") {
    const s = PaypalTransactionSearch.safeParse(body);
    const id = str(args.transaction_id);
    // One row per payload, as in the case file, so fact json paths point into that row.
    const row = s.success
      ? s.data.transaction_details.find(
          (t) =>
            t.transaction_info.transaction_event_code === "T0000" &&
            (!id || t.transaction_info.transaction_id === id),
        )
      : undefined;
    return row
      ? {
          ref: row.transaction_info.transaction_id,
          payload: row,
          facts: (src) => extractTransaction(row, src),
        }
      : none;
  }
  if (name === "get_shipment_tracking" && body && typeof body === "object") {
    // Response shape not in the contract yet (03 section 6, S8): read the tracker fields when present.
    const b = body as { trackers?: unknown[] };
    const t = (Array.isArray(b.trackers) ? b.trackers[0] : body) as Parameters<
      typeof extractTracker
    >[0];
    return {
      ref: str(args.order_id) ?? name,
      payload: body,
      facts: (src) => extractTracker(t ?? {}, src),
    };
  }
  return none;
}

export function recordTools(
  source: PaypalReadTools,
  store: StorePayload,
  now: () => Date,
): CopilotTool[] {
  return source.tools.map((def) => ({
    def,
    async run(args) {
      const text = await source.call(def.function.name, args);
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // An error message from the tool: stored as text, no facts.
      }
      const x = extract(def.function.name, args, body);
      const fetchedAt = now();
      const payloadId = await store(
        `copilot.${def.function.name}`,
        x.ref,
        x.payload,
      );
      return x.facts({ payloadId, fetchedAt: fetchedAt.toISOString() });
    },
  }));
}
