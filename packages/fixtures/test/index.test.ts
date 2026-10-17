import { describe, expect, it } from "vitest";
import * as mod from "../src/index";

describe("@ds/fixtures", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
