import { describe, expect, it, vi } from "vitest";
import { LlmAuthError, LlmBadResponseError, LlmRateLimitError, LlmTimeoutError, LlmUpstreamError, createOllamaClient } from "../src/index.js";

const OK = { model: "m", message: { role: "assistant", content: "hi" }, done: true };

function res(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, ...init });
}

describe("createOllamaClient", () => {
  it("posts to /api/chat on Ollama Cloud with a bearer key and stream:false", async () => {
    const f = vi.fn().mockResolvedValue(res(OK));
    const client = createOllamaClient({ apiKey: "k-123", fetch: f });
    const out = await client.chat({ model: "gpt-oss:120b", messages: [{ role: "user", content: "x" }] });
    expect(out.message.content).toBe("hi");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ollama.com/api/chat");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k-123");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "gpt-oss:120b", stream: false });
  });

  it("never sends a structured-output format unless the caller sets one", async () => {
    const f = vi.fn().mockResolvedValue(res(OK));
    await createOllamaClient({ apiKey: "k", fetch: f }).chat({ model: "m", messages: [] });
    expect(JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string)).not.toHaveProperty("format");
  });

  it("talks to a local daemon without a key", async () => {
    const f = vi.fn().mockResolvedValue(res(OK));
    await createOllamaClient({ host: "http://localhost:11434/", fetch: f }).chat({ model: "m", messages: [] });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("maps 401 to LlmAuthError without leaking the key", async () => {
    const f = vi.fn().mockResolvedValue(res("nope", { status: 401 }));
    const err = await createOllamaClient({ apiKey: "super-secret-key", fetch: f }).chat({ model: "m", messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmAuthError);
    expect(String(err.message)).not.toContain("super-secret-key");
  });

  it("maps 429 with Retry-After", async () => {
    const f = vi.fn().mockResolvedValue(res("slow down", { status: 429, headers: { "retry-after": "7" } }));
    const err = await createOllamaClient({ apiKey: "k", fetch: f }).chat({ model: "m", messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmRateLimitError);
    expect(err.retryAfterSeconds).toBe(7);
  });

  it("truncates upstream error bodies", async () => {
    const f = vi.fn().mockResolvedValue(res("x".repeat(5000), { status: 502 }));
    const err = await createOllamaClient({ apiKey: "k", fetch: f }).chat({ model: "m", messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmUpstreamError);
    expect(err.message.length).toBeLessThan(400);
  });

  it("times out", async () => {
    const f = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_r, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const err = await createOllamaClient({ apiKey: "k", fetch: f as unknown as typeof fetch, timeoutMs: 20 }).chat({ model: "m", messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmTimeoutError);
  });

  it("rethrows the caller's own abort", async () => {
    const f = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_r, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const ac = new AbortController();
    const p = createOllamaClient({ apiKey: "k", fetch: f as unknown as typeof fetch, timeoutMs: 5000 }).chat({ model: "m", messages: [] }, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects non-JSON and wrong-shape answers", async () => {
    const bad1 = vi.fn().mockResolvedValue(res("<html>", { status: 200 }));
    await expect(createOllamaClient({ apiKey: "k", fetch: bad1 }).chat({ model: "m", messages: [] })).rejects.toBeInstanceOf(LlmBadResponseError);
    const bad2 = vi.fn().mockResolvedValue(res({ nope: true }));
    await expect(createOllamaClient({ apiKey: "k", fetch: bad2 }).chat({ model: "m", messages: [] })).rejects.toBeInstanceOf(LlmBadResponseError);
  });

  it("lists models from /api/tags", async () => {
    const f = vi.fn().mockResolvedValue(res({ models: [{ name: "gpt-oss:120b" }, { model: "gemma4:31b" }] }));
    expect(await createOllamaClient({ apiKey: "k", fetch: f }).listModels()).toEqual(["gpt-oss:120b", "gemma4:31b"]);
    expect((f.mock.calls[0] as [string])[0]).toBe("https://ollama.com/api/tags");
  });
});
