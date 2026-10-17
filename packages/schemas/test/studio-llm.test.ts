import { describe, expect, it } from "vitest";
import { StudioTurnRequest } from "../src/index.js";

describe("StudioTurnRequest", () => {
  it("accepts a minimal request", () => {
    expect(StudioTurnRequest.safeParse({ input: [], responseFormat: { type: "text" } }).success).toBe(true);
  });
  it("rejects unknown item types and oversized input", () => {
    expect(StudioTurnRequest.safeParse({ input: [{ type: "weird" }], responseFormat: { type: "text" } }).success).toBe(false);
    expect(StudioTurnRequest.safeParse({ input: Array.from({ length: 301 }, () => ({ type: "reasoning" })), responseFormat: { type: "text" } }).success).toBe(false);
  });
  it("requires a response format", () => {
    expect(StudioTurnRequest.safeParse({ input: [] }).success).toBe(false);
  });
});
