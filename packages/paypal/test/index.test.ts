import { describe, expect, it } from "vitest";
import * as mod from "../src/index";

describe("@ds/paypal", () => {
  it("loads", () => {
    expect(mod).toBeDefined();
  });
});
