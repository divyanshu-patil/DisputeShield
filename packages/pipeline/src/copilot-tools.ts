import { type PaypalReadTools, paypalReadToolDefs } from "@ds/agent";
import type { PayPalGateway } from "@ds/paypal";

const DAY = 86_400_000;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * The toolkit's read tools served by our gateway: recorded sandbox data in replay mode, or the REST
 * client in live mode when the toolkit has no credentials. Same names and arguments as the toolkit.
 */
export function gatewayReadTools(
  gateway: PayPalGateway,
  clock: () => Date,
): PaypalReadTools {
  const run: Record<string, (a: Record<string, unknown>) => Promise<unknown>> =
    {
      get_dispute: async (a) =>
        (await gateway.getDispute(str(a.dispute_id) ?? "")).body,
      get_order: async (a) => (await gateway.getOrder(str(a.id) ?? "")).body,
      list_transactions: async (a) => {
        const now = clock().getTime();
        return (
          await gateway.searchTransactions({
            startDate:
              str(a.start_date) ?? new Date(now - 30 * DAY).toISOString(),
            endDate: str(a.end_date) ?? new Date(now).toISOString(),
            transactionId: str(a.transaction_id),
          })
        ).body;
      },
      get_shipment_tracking: async () => {
        throw new Error(
          "not recorded here; the order (get_order) lists its trackers",
        );
      },
    };
  return {
    tools: paypalReadToolDefs(),
    async call(name, args) {
      const fn = run[name];
      if (!fn) return `error: unknown tool ${name}`;
      try {
        return JSON.stringify(await fn(args));
      } catch (err) {
        return `error: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`;
      }
    },
  };
}
