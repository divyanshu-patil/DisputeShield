import { z } from "zod";

// Native Ollama chat API shapes (https://ollama.com/api/chat ✅ documented; field names for tool calls
// and token counts are from memory ⚠️ and parsed leniently).

export type OllamaToolCall = {
  function: { name: string; arguments: Record<string, unknown> };
};

export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  /** Name of the tool that produced a `tool` message ⚠️ */
  tool_name?: string;
};

export type OllamaTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OllamaChatRequest = {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  /** "json" or a JSON schema. NOT supported by Ollama Cloud today ✅ (docs), so we do not send it. */
  format?: "json" | Record<string, unknown>;
  options?: { temperature?: number; num_predict?: number };
};

const ToolCallSchema = z.object({
  function: z.object({
    name: z.string(),
    // The native API returns an object; accept a JSON string defensively.
    arguments: z
      .union([z.record(z.string(), z.unknown()), z.string()])
      .optional(),
  }),
});

export const OllamaChatResponseSchema = z
  .object({
    model: z.string().optional(),
    message: z.object({
      role: z.string().optional(),
      content: z.string().default(""),
      thinking: z.string().optional(),
      tool_calls: z.array(ToolCallSchema).optional(),
    }),
    done: z.boolean().optional(),
    done_reason: z.string().optional(),
    prompt_eval_count: z.number().optional(),
    eval_count: z.number().optional(),
  })
  .loose();
export type OllamaChatResponse = z.infer<typeof OllamaChatResponseSchema>;

export interface LlmClient {
  /** One non-streaming chat turn. */
  chat(
    request: OllamaChatRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<OllamaChatResponse>;
  /** Names of models the provider lists for this account (used by the health check). */
  listModels(opts?: { signal?: AbortSignal }): Promise<string[]>;
}
