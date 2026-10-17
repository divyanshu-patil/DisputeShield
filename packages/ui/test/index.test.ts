import { describe, expect, it } from "vitest";
import * as mod from "../src/index";

describe("@ds/ui", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
