import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("ds", () => {
  it("prints_help", () => {
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", "src/index.ts", "--help"],
      { encoding: "utf8" },
    );
    expect(out).toContain("Usage: ds");
    // Spawning tsx is slow when turbo runs every package's tests at once.
  }, 20_000);
});
