import type { Fact } from "@ds/schemas";
import { describe, expect, it } from "vitest";
import { fillDraft, templateDraft } from "../src/index.js";

const fact = (key: string, display: string) => ({ key, display }) as Fact;

describe("recorded drafts (AC-DEMO-03)", () => {
  it("templates cited values and re-binds them to new facts", () => {
    const draft = {
      evidenceType: "PROOF_OF_FULFILLMENT" as const,
      statements: [
        {
          text: "Shipped on 2026-10-05 via UPS.",
          factKeys: ["shipped", "carrier"],
        },
        { text: "Delivered on 2026-10-08.", factKeys: ["gone"] },
      ],
      recommendation: { action: "FIGHT" as const, rationale: [] },
    };
    const t = templateDraft(draft, [
      fact("shipped", "2026-10-05"),
      fact("carrier", "UPS"),
      fact("gone", "2026-10-08"),
    ]);
    expect(t.statements[0]?.text).toBe(
      "Shipped on {{shipped}} via {{carrier}}.",
    );
    const f = fillDraft(t, [
      fact("shipped", "2026-11-01"),
      fact("carrier", "UPS"),
    ]);
    expect(f.statements.map((s) => s.text)).toEqual([
      "Shipped on 2026-11-01 via UPS.",
      "Delivered on {{gone}}.",
    ]);
  });
});
