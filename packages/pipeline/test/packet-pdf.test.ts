import { describe, expect, it } from "vitest";
import { PDF_LINE_CHARS, textPdf, wrap } from "../src/packet-pdf.js";

describe("packet PDF (AC-SUB-12)", () => {
  it("wraps on spaces, hard-breaks long words and keeps the indent", () => {
    expect(wrap("  aa bb cc", 7)).toEqual(["  aa bb", "  cc"]);
    expect(wrap("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrap("x".repeat(PDF_LINE_CHARS)).length).toBe(1);
  });

  it("writes a valid xref, escapes text and adds pages as needed", () => {
    const lines = [
      "Title (with parens) \\ and é and ✓",
      ...Array.from({ length: 120 }, (_, i) => `line ${i}`),
    ];
    const pdf = textPdf(lines, "T");
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("(Title \\(with parens\\) \\\\ and \xe9 and ?)");
    expect(s).toMatch(/\/Count 3 >>/);
    // Every xref entry points at the start of its object.
    const xref = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    const entries = s
      .slice(xref)
      .split("\n")
      .slice(3)
      .filter((l) => / n $/.test(l));
    entries.forEach((e, i) => {
      expect(
        s.slice(Number(e.slice(0, 10)), Number(e.slice(0, 10)) + 12),
      ).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });
});
