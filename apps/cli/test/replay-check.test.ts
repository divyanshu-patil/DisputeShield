import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { replayCheck } from "../src/commands/replay-check.js";

describe("replay-check", () => {
  it("passes_the_committed_fixtures", () => {
    expect(replayCheck()).toEqual([]);
  });

  it("flags_schema_failures_and_unredacted_emails", () => {
    const dir = mkdtempSync(join(tmpdir(), "ds-replay-"));
    mkdirSync(join(dir, "disputes"));
    writeFileSync(join(dir, "disputes", "x.details.json"), '{"dispute_id": 7}');
    writeFileSync(join(dir, "note.json"), '{"payer": "real.person@gmail.com"}');
    const problems = replayCheck(dir);
    expect(problems.some((p) => p.startsWith("disputes/x.details.json:"))).toBe(
      true,
    );
    expect(problems).toContain("note.json: unredacted email address");
  });
});
