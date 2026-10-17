// Strips secrets and personal data before anything is logged or saved as a fixture (AGENTS.md rule 8).
// Field names come from the S0 token response and the S2 dispute payloads.
// ponytail: free text (messages, evidence notes) keeps its words and only loses emails; the sandbox text is
// ours. Add a free-text scrubber before recording anything a real buyer typed. Dates are not shifted.

const SECRET_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "nonce",
  "app_id",
  "client_id",
  "client_secret",
  "payer_id",
  "merchant_id",
]);
const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/g;

// Dispute parties (`disputed_transactions[].buyer` / `.seller`) get stable synthetic identities.
const PARTIES: Record<string, Record<string, string>> = {
  buyer: { name: "Jordan Avery", email: "buyer@example.com" },
  seller: { name: "Hearthside Ceramics", email: "seller@example.com" },
};

/** Keeps the first three characters and the length, so a fixture still looks like the real thing. */
const mask = (s: string): string =>
  s.slice(0, 3) + "x".repeat(Math.max(0, s.length - 3));

export function redact(value: unknown, key?: string): unknown {
  if (typeof value === "string")
    return key && SECRET_KEYS.has(key)
      ? mask(value)
      : value.replace(EMAIL, "buyer@example.com");
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === "object") {
    const fake = key ? PARTIES[key] : undefined;
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        fake?.[k] !== undefined && typeof v === "string"
          ? fake[k]
          : redact(v, k),
      ]),
    );
  }
  return value;
}
