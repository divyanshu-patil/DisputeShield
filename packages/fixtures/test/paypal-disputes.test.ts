import { readdirSync, readFileSync } from "node:fs";
import { PaypalDisputeDetails, PaypalDisputeList } from "@ds/schemas";
import { describe, expect, it } from "vitest";

// Every recorded dispute fixture must parse against its schema (docs/03 section 8).
const dir = new URL("../paypal/disputes/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f: string): unknown =>
  JSON.parse(readFileSync(new URL(f, dir), "utf8"));

describe("paypal dispute fixtures", () => {
  it.each(files.filter((f) => f.endsWith(".details.json")))(
    "%s parses",
    (f) => {
      expect(PaypalDisputeDetails.safeParse(load(f)).error).toBeUndefined();
    },
  );
  it.each(files.filter((f) => f.startsWith("list.")))("%s parses", (f) => {
    expect(PaypalDisputeList.safeParse(load(f)).error).toBeUndefined();
  });
});
