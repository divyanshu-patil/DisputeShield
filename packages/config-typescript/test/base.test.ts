import { describe, expect, it } from "vitest";
import base from "../base.json" with { type: "json" };

describe("@ds/config-typescript base", () => {
  it("keeps_strict_and_unchecked_index_access_on", () => {
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });
});
