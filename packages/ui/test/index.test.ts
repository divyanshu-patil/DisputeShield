import { describe, expect, it } from "vitest";
import { band, formatMoney, reasonLabel, timeLeft } from "../src/format.js";

describe("format", () => {
  const now = Date.parse("2026-10-18T00:00:00Z");
  it("bands_and_time_left", () => {
    expect(band("2026-10-18T05:12:00Z", now)).toBe("URGENT");
    expect(timeLeft("2026-10-18T05:12:00Z", now)).toBe("5 h 12 m");
    expect(timeLeft("2026-10-21T04:00:00Z", now)).toBe("3 d 4 h");
    expect(band("2026-10-17T00:00:00Z", now)).toBe("OVERDUE");
    expect(band(null, now)).toBe("NONE");
  });
  it("money_and_labels", () => {
    expect(formatMoney(4800, "USD")).toBe("$48.00");
    expect(formatMoney(1200, "JPY")).toBe("¥1,200");
    expect(reasonLabel("MERCHANDISE_OR_SERVICE_NOT_RECEIVED")).toBe(
      "Item not received",
    );
  });
});
