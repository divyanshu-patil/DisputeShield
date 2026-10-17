import { readdirSync, readFileSync } from "node:fs";
import { PaypalOrder, PaypalTransactionSearch } from "@ds/schemas";
import { describe, expect, it } from "vitest";

// Recorded Transaction search (S6) and order (S7/S8) fixtures must parse (docs/03 section 8).
const load = (dir: URL, f: string): unknown =>
  JSON.parse(readFileSync(new URL(f, dir), "utf8"));
const jsonIn = (dir: URL): string[] =>
  readdirSync(dir).filter((f) => f.endsWith(".json"));

const txns = new URL("../paypal/transactions/", import.meta.url);
const orders = new URL("../paypal/orders/", import.meta.url);

describe("paypal transaction and order fixtures", () => {
  it.each(jsonIn(txns))("%s parses", (f) => {
    expect(
      PaypalTransactionSearch.safeParse(load(txns, f)).error,
    ).toBeUndefined();
  });
  it.each(jsonIn(orders))("%s parses", (f) => {
    expect(PaypalOrder.safeParse(load(orders, f)).error).toBeUndefined();
  });
});
