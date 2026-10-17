import { randomUUID } from "node:crypto";
import type { StudioTurnRequest, StudioTurnResponse } from "@ds/schemas";
import type {
  LlmClient,
  OllamaChatRequest,
  OllamaMessage,
  OllamaTool,
} from "../llm/types.js";

// Translates one AG Studio agent turn into an Ollama chat call and back. Pure functions plus a
// small orchestrator. The browser adapter lives in packages/ui; the HTTP route lives in apps/api.

function textOf(content: Array<{ type: string; text?: unknown }>): string {
  return content
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof p.text === "string",
    )
    .map((p) => p.text)
    .join("\n");
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toOllamaChat(
  req: StudioTurnRequest,
  defaultModel: string,
): OllamaChatRequest {
  const messages: OllamaMessage[] = [];
  const system: string[] = [];
  if (req.instructions) system.push(req.instructions);

  // Ollama Cloud has no structured output ✅, so JSON is requested in the prompt.
  if (req.responseFormat.type === "json") {
    system.push(
      `Respond with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(req.responseFormat.schema)}`,
    );
  }
  // Ollama has no tool_choice parameter ⚠️. Approximate it in the prompt.
  if (req.toolChoice === "required")
    system.push("You must call one of the provided tools.");
  if (req.toolChoice && typeof req.toolChoice === "object")
    system.push(`You must call the tool named "${req.toolChoice.name}".`);
  if (system.length > 0)
    messages.push({ role: "system", content: system.join("\n\n") });

  const nameByCallId = new Map<string, string>();
  for (const item of req.input) {
    if (item.type === "message") {
      const text = textOf(item.content);
      messages.push({ role: item.role, content: text });
    } else if (item.type === "function_call") {
      nameByCallId.set(item.callId, item.name);
      const call = {
        function: { name: item.name, arguments: parseArgs(item.arguments) },
      };
      const last = messages[messages.length - 1];
      // Consecutive calls from one turn share one assistant message.
      if (
        last &&
        last.role === "assistant" &&
        last.tool_calls &&
        last.content === ""
      )
        last.tool_calls.push(call);
      else
        messages.push({ role: "assistant", content: "", tool_calls: [call] });
    } else if (item.type === "function_call_output") {
      const toolName = nameByCallId.get(item.callId);
      messages.push({
        role: "tool",
        content: item.output,
        ...(toolName ? { tool_name: toolName } : {}),
      });
    }
    // reasoning items are dropped
  }

  const tools: OllamaTool[] | undefined =
    req.toolChoice === "none" || !req.tools || req.tools.length === 0
      ? undefined
      : req.tools
          .filter((t) => (t.kind ?? "client") === "client")
          .map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }));

  return {
    model: req.model?.id || defaultModel,
    messages,
    ...(tools && tools.length > 0 ? { tools } : {}),
    options: { temperature: 0 },
  };
}

export function fromOllamaChat(
  res: Awaited<ReturnType<LlmClient["chat"]>>,
  opts: { now?: () => number; id?: () => string } = {},
): StudioTurnResponse {
  const now = opts.now ?? Date.now;
  const id = opts.id ?? randomUUID;
  const output: StudioTurnResponse["output"] = [];

  if (res.message.content.trim().length > 0) {
    output.push({
      id: id(),
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text: res.message.content, annotations: [] }],
    });
  }
  for (const call of res.message.tool_calls ?? []) {
    const args = call.function.arguments;
    const callId = id();
    output.push({
      id: callId,
      kind: "output",
      type: "function_call",
      callId,
      name: call.function.name,
      arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
      status: "completed",
    });
  }

  const input = res.prompt_eval_count;
  const out = res.eval_count;
  return {
    id: id(),
    createdAt: now(),
    status: res.done_reason === "length" ? "incomplete" : "completed",
    ...(res.model ? { model: res.model } : {}),
    output,
    ...(input !== undefined && out !== undefined
      ? {
          usage: {
            inputTokens: input,
            outputTokens: out,
            totalTokens: input + out,
          },
        }
      : {}),
  };
}

export type StudioTurnHandler = (
  req: StudioTurnRequest,
  opts?: { signal?: AbortSignal },
) => Promise<StudioTurnResponse>;

export function createStudioTurnHandler(
  client: LlmClient,
  defaultModel: string,
): StudioTurnHandler {
  return async (req, opts) => {
    const chat = await client.chat(toOllamaChat(req, defaultModel), opts);
    return fromOllamaChat(chat);
  };
}
