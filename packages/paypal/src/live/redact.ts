// Strips secrets and personal data before anything is logged or saved as a fixture (AGENTS.md rule 8).
// ponytail: covers tokens, ids and emails, enough for the S0 token fixture. Names, phones and street lines
// are added with the first dispute fixtures (S2 / P1-5), when we can see the real field names.

const SECRET_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "nonce",
  "app_id",
  "client_id",
  "client_secret",
]);
const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/g;

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
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redact(v, k)]),
    );
  }
  return value;
}
