import { describe, expect, it } from "vitest";
import * as mod from "../src/index";

describe("@ds/db", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
