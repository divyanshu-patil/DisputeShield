import { z } from "zod";

// Wire format between the AG Studio chat (browser) and POST /api/studio/llm/turn (Fastify).
// It mirrors the parts of AG Studio's AgLlmRequest / AgLlmResponse we use (ag-studio 3.0.0 types,
// read 2026-10-17 ✅) without importing ag-studio, so the server stays free of browser packages.

const TextPart = z.object({ type: z.literal("text"), text: z.string().max(100_000) }).loose();
const OtherPart = z.object({ type: z.string() }).loose();

export const StudioConversationItem = z.union([
  // user / system / assistant message
  z
    .object({
      type: z.literal("message"),
      role: z.enum(["user", "system", "assistant"]),
      content: z.array(z.union([TextPart, OtherPart])).max(50),
    })
    .loose(),
  // assistant tool call
  z
    .object({
      type: z.literal("function_call"),
      callId: z.string().min(1).max(200),
      name: z.string().min(1).max(200),
      arguments: z.string().max(100_000),
    })
    .loose(),
  // result of a tool call
  z
    .object({
      type: z.literal("function_call_output"),
      callId: z.string().min(1).max(200),
      output: z.string().max(200_000),
    })
    .loose(),
  // reasoning items are accepted and ignored
  z.object({ type: z.literal("reasoning") }).loose(),
]);
export type StudioConversationItem = z.infer<typeof StudioConversationItem>;

export const StudioToolSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(10_000),
    parameters: z.record(z.string(), z.unknown()),
    kind: z.enum(["client", "server", "provided"]).optional(),
  })
  .loose();
export type StudioToolSchema = z.infer<typeof StudioToolSchema>;

export const StudioTurnRequest = z.object({
  instructions: z.string().max(100_000).optional(),
  input: z.array(StudioConversationItem).max(300),
  tools: z.array(StudioToolSchema).max(64).optional(),
  toolChoice: z.union([z.enum(["auto", "none", "required"]), z.object({ name: z.string() })]).optional(),
  responseFormat: z.union([
    z.object({ type: z.literal("text") }),
    z.object({ type: z.literal("json"), name: z.string(), description: z.string().optional(), schema: z.record(z.string(), z.unknown()) }),
  ]),
  model: z.object({ id: z.string().max(200), effort: z.string().max(50).optional() }).optional(),
});
export type StudioTurnRequest = z.infer<typeof StudioTurnRequest>;

export const StudioOutputMessage = z.object({
  id: z.string(),
  kind: z.literal("output"),
  type: z.literal("message"),
  role: z.literal("assistant"),
  status: z.literal("completed"),
  content: z.array(z.object({ type: z.literal("text"), text: z.string(), annotations: z.array(z.unknown()) })),
});
export const StudioOutputToolCall = z.object({
  id: z.string(),
  kind: z.literal("output"),
  type: z.literal("function_call"),
  callId: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: z.literal("completed"),
});

export const StudioTurnResponse = z.object({
  id: z.string(),
  createdAt: z.number(),
  status: z.enum(["completed", "failed", "incomplete"]),
  model: z.string().optional(),
  output: z.array(z.union([StudioOutputMessage, StudioOutputToolCall])),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), totalTokens: z.number().optional() }).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type StudioTurnResponse = z.infer<typeof StudioTurnResponse>;
