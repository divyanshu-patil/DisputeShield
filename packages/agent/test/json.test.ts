import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../src/index.js";

describe("extractJsonObject", () => {
  it("parses plain JSON", () => expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 }));
  it("strips code fences and prose", () => {
    expect(extractJsonObject('Sure! Here you go:\n```json\n{"a":{"b":[1,2]}}\n```\nHope that helps')).toEqual({ a: { b: [1, 2] } });
  });
  it("handles braces inside strings", () => expect(extractJsonObject('{"t":"a } b { c","n":2}')).toEqual({ t: "a } b { c", n: 2 }));
  it("handles escaped quotes", () => expect(extractJsonObject('{"t":"say \\"hi\\" }"}')).toEqual({ t: 'say "hi" }' }));
  it("skips an invalid first object and finds the next", () => expect(extractJsonObject('{oops} then {"ok":true}')).toEqual({ ok: true }));
  it("returns undefined when nothing parses", () => {
    expect(extractJsonObject("no json here")).toBeUndefined();
    expect(extractJsonObject('{"unterminated": ')).toBeUndefined();
  });
});
