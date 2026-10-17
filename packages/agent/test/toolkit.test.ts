import { describe, expect, it } from "vitest";
import { createPaypalReadTools } from "../src/index.js";

describe("Studio PayPal tools (AC-STUDIO-05)", () => {
  it("exposes only read tools, so an injected instruction has no write tool to call", () => {
    const { tools } = createPaypalReadTools({
      clientId: "test-id",
      clientSecret: "test-secret",
    });
    const names = tools.map((t) => t.function.name);
    expect(names.length).toBeGreaterThan(0);
    expect(
      names.filter((n) =>
        /create|update|accept|refund|provide|send|cancel|capture|delete|escalat|appeal|offer|add|void|patch|acknowledge/i.test(
          n,
        ),
      ),
    ).toEqual([]);
  });
});
