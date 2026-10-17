import { describe, expect, it, vi } from "vitest";
import { StudioTurnRequest } from "@ds/schemas";
import { createStudioTurnHandler, fromOllamaChat, toOllamaChat, type LlmClient } from "../src/index.js";

const base = { responseFormat: { type: "text" as const } };

describe("toOllamaChat", () => {
  it("puts instructions first and asks for JSON in the prompt (cloud has no structured outputs)", () => {
    const out = toOllamaChat(
      StudioTurnRequest.parse({ instructions: "Be brief.", input: [], responseFormat: { type: "json", name: "x", schema: { type: "object" } } }),
      "m",
    );
    expect(out.messages[0]?.role).toBe("system");
    expect(out.messages[0]?.content).toContain("Be brief.");
    expect(out.messages[0]?.content).toContain('{"type":"object"}');
    expect(out).not.toHaveProperty("format");
  });

  it("converts messages, drops reasoning, and uses the chosen model", () => {
    const req = StudioTurnRequest.parse({
      ...base,
      model: { id: "gemma4:31b" },
      input: [
        { kind: "input", type: "message", role: "user", content: [{ type: "text", text: "hello" }, { type: "image", detail: "auto" }] },
        { type: "reasoning", id: "r1", summary: [] },
        { kind: "output", type: "message", role: "assistant", content: [{ type: "text", text: "hi", annotations: [] }] },
      ],
    });
    const out = toOllamaChat(req, "default");
    expect(out.model).toBe("gemma4:31b");
    expect(out.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("merges consecutive tool calls and names tool results", () => {
    const req = StudioTurnRequest.parse({
      ...base,
      input: [
        { type: "function_call", callId: "c1", name: "viewSchema", arguments: "{}" },
        { type: "function_call", callId: "c2", name: "executeQuery", arguments: '{"q":1}' },
        { type: "function_call_output", callId: "c1", output: "schema!" },
        { type: "function_call_output", callId: "c2", output: "rows!" },
      ],
    });
    const out = toOllamaChat(req, "m");
    expect(out.messages).toHaveLength(3);
    expect(out.messages[0]?.tool_calls?.map((c) => c.function.name)).toEqual(["viewSchema", "executeQuery"]);
    expect(out.messages[0]?.tool_calls?.[1]?.function.arguments).toEqual({ q: 1 });
    expect(out.messages[1]).toEqual({ role: "tool", content: "schema!", tool_name: "viewSchema" });
  });

  it("survives malformed tool arguments", () => {
    const req = StudioTurnRequest.parse({ ...base, input: [{ type: "function_call", callId: "c", name: "t", arguments: "{not json" }] });
    expect(toOllamaChat(req, "m").messages[0]?.tool_calls?.[0]?.function.arguments).toEqual({});
  });

  it("sends only client tools and none when toolChoice is none", () => {
    const tools = [
      { name: "a", description: "A", parameters: { type: "object" } },
      { name: "b", description: "B", parameters: { type: "object" }, kind: "server" },
    ];
    const withTools = toOllamaChat(StudioTurnRequest.parse({ ...base, input: [], tools }), "m");
    expect(withTools.tools?.map((t) => t.function.name)).toEqual(["a"]);
    const none = toOllamaChat(StudioTurnRequest.parse({ ...base, input: [], tools, toolChoice: "none" }), "m");
    expect(none.tools).toBeUndefined();
  });

  it("approximates toolChoice in the prompt", () => {
    const out = toOllamaChat(StudioTurnRequest.parse({ ...base, input: [], toolChoice: { name: "executeQuery" } }), "m");
    expect(out.messages[0]?.content).toContain('"executeQuery"');
  });

  it("is deterministic (temperature 0)", () => {
    expect(toOllamaChat(StudioTurnRequest.parse({ ...base, input: [] }), "m").options?.temperature).toBe(0);
  });
});

describe("fromOllamaChat", () => {
  const ids = () => {
    let n = 0;
    return () => `id-${++n}`;
  };

  it("maps text, tool calls (object args become a JSON string) and usage", () => {
    const out = fromOllamaChat(
      { model: "m", message: { content: "ok", tool_calls: [{ function: { name: "executeQuery", arguments: { limit: 5 } } }] }, prompt_eval_count: 10, eval_count: 4 },
      { id: ids(), now: () => 123 },
    );
    expect(out.createdAt).toBe(123);
    expect(out.output).toHaveLength(2);
    expect(out.output[1]).toMatchObject({ type: "function_call", name: "executeQuery", arguments: '{"limit":5}' });
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  });

  it("skips empty text and flags truncation", () => {
    const out = fromOllamaChat({ message: { content: "  " }, done_reason: "length" }, { id: ids() });
    expect(out.output).toHaveLength(0);
    expect(out.status).toBe("incomplete");
  });

  it("round-trips through the handler", async () => {
    const client: LlmClient = {
      chat: vi.fn().mockResolvedValue({ message: { content: "answer" } }),
      listModels: async () => [],
    };
    const handle = createStudioTurnHandler(client, "default-model");
    const out = await handle(StudioTurnRequest.parse({ ...base, input: [{ kind: "input", type: "message", role: "user", content: [{ type: "text", text: "q" }] }] }));
    expect(out.output[0]).toMatchObject({ type: "message" });
    expect((client.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].model).toBe("default-model");
  });
});
