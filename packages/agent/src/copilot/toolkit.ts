import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import type { OllamaTool } from "../llm/types.js";

// The only place @paypal/agent-toolkit is used (docs/03 section 7). Read actions only. The toolkit's
// OpenAI adapter returns JSON-schema tool definitions in the same shape Ollama's `tools` takes, and
// `handleToolCall` executes one call. Confirmed in spike S9 part 2 (2026-10-18, toolkit 1.11.0).

export const READ_ACTIONS = {
  disputes: { list: true, get: true },
  orders: { get: true },
  shipment: { get: true },
  transactions: { list: true },
};

/** The Case Copilot's tools (architecture 5.6); `list_disputes` is left out, the copilot works on one case. */
export const COPILOT_TOOL_NAMES = [
  "get_dispute",
  "get_order",
  "get_shipment_tracking",
  "list_transactions",
];

export type PaypalReadTools = {
  tools: OllamaTool[];
  /** Runs one tool; returns the tool's text result (JSON from PayPal, or an error message). */
  call(name: string, args: Record<string, unknown>): Promise<string>;
};

const toolkitFor = (credentials: { clientId: string; clientSecret: string }) =>
  new PayPalAgentToolkit({
    ...credentials,
    configuration: { actions: READ_ACTIONS, context: { sandbox: true } },
  });

const definitions = (toolkit: PayPalAgentToolkit): OllamaTool[] =>
  toolkit
    .getTools()
    .filter((t) => COPILOT_TOOL_NAMES.includes(t.function.name))
    .map((t) => ({
      type: "function",
      function: {
        name: t.function.name,
        description: t.function.description ?? "",
        parameters: t.function.parameters ?? {},
      },
    }));

/**
 * The toolkit's tool definitions without credentials, for replay mode. `getTools()` makes no network
 * call (checked 2026-10-18), so placeholder credentials are never sent anywhere.
 */
export const paypalReadToolDefs = (): OllamaTool[] =>
  definitions(toolkitFor({ clientId: "replay", clientSecret: "replay" }));

export function createPaypalReadTools(credentials: {
  clientId: string;
  clientSecret: string;
}): PaypalReadTools {
  const toolkit = toolkitFor(credentials);
  const tools = definitions(toolkit);
  return {
    tools,
    async call(name, args) {
      if (!COPILOT_TOOL_NAMES.includes(name))
        return `error: unknown tool ${name}`;
      const out = await toolkit.handleToolCall({
        id: name,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      });
      return typeof out.content === "string"
        ? out.content
        : JSON.stringify(out.content);
    },
  };
}
