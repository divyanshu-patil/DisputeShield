import { toMinor } from "../decision/money.js";

// Token extraction for the verifier (05 section 5). Every number, date, amount or identifier in a
// statement becomes a normalised token; the statement passes only if each token also appears in the
// display of a fact it cites.

export type Token =
  | { kind: "date"; value: string; raw: string } // ISO YYYY-MM-DD
  | { kind: "money"; currency: string | null; minor: number; raw: string }
  | { kind: "id"; value: string; raw: string } // upper-cased, 8+ alnum with a digit
  | { kind: "int"; value: number; raw: string };

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};
const CURRENCY =
  "(USD|EUR|GBP|JPY|INR|AUD|CAD|CHF|HKD|SGD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|MXN|BRL|ILS|PHP|THB|TWD|MYR|RUB|CNY)";

const g = (m: RegExpExecArray, i: number): string => m[i] ?? "";

type Pattern = { re: RegExp; make: (m: RegExpExecArray) => Token | null };

const iso = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    return null;
  return dt.toISOString().slice(0, 10);
};
const month = (s: string): number =>
  MONTHS[s.toLowerCase().replace(".", "").slice(0, 3)] ?? 0;
const money = (
  currency: string | null,
  amount: string,
  raw: string,
): Token | null => {
  try {
    return {
      kind: "money",
      currency,
      minor: toMinor(amount.replaceAll(",", ""), currency ?? "USD"),
      raw,
    };
  } catch {
    return null;
  }
};

// Order matters: earlier patterns claim their span first, so "2026-10-12" is a date, not three integers.
const PATTERNS: Pattern[] = [
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?\b/g,
    make: (m) => date(iso(+g(m, 1), +g(m, 2), +g(m, 3)), m[0]),
  },
  {
    re: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(\\d{4})\\b`,
      "gi",
    ),
    make: (m) => date(iso(+g(m, 3), month(g(m, 2)), +g(m, 1)), m[0]),
  },
  {
    re: new RegExp(
      `\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      "gi",
    ),
    make: (m) => date(iso(+g(m, 3), month(g(m, 1)), +g(m, 2)), m[0]),
  },
  {
    re: new RegExp(`\\b${CURRENCY}\\s?(\\d[\\d,]*(?:\\.\\d+)?)`, "g"),
    make: (m) => money(g(m, 1), g(m, 2), m[0]),
  },
  {
    re: new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s?${CURRENCY}\\b`, "g"),
    make: (m) => money(g(m, 2), g(m, 1), m[0]),
  },
  {
    re: /([$€£¥₹])\s?(\d[\d,]*(?:\.\d+)?)/g,
    make: (m) => money(SYMBOLS[g(m, 1)] ?? null, g(m, 2), m[0]),
  },
  {
    re: /\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}(?:-[A-Za-z0-9]+)*\b/g,
    make: (m) => ({
      kind: "id",
      value: m[0].toUpperCase().replaceAll("-", ""),
      raw: m[0],
    }),
  },
  { re: /\b\d+\.\d+\b/g, make: (m) => money(null, m[0], m[0]) },
  {
    re: /\b\d+\b/g,
    make: (m) => ({ kind: "int", value: Number(m[0]), raw: m[0] }),
  },
];

function date(value: string | null, raw: string): Token | null {
  return value
    ? { kind: "date", value, raw }
    : { kind: "id", value: raw.toUpperCase(), raw };
}

export function extractTokens(text: string): Token[] {
  const taken: [number, number][] = [];
  const found: { at: number; token: Token }[] = [];
  for (const { re, make } of PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const token = make(m);
      if (!token) continue;
      taken.push([start, end]);
      found.push({ at: start, token });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.token);
}

/** True when `t` equals some token found in the cited displays. Money compares currency and minor units. */
export function tokenMatches(t: Token, cited: Token[]): boolean {
  return cited.some((c) => {
    if (t.kind === "date") return c.kind === "date" && c.value === t.value;
    if (t.kind === "id")
      return (
        (c.kind === "id" && c.value === t.value) ||
        (c.kind === "int" && String(c.value) === t.value)
      );
    if (t.kind === "money") {
      return (
        c.kind === "money" &&
        c.minor === t.minor &&
        (t.currency === null ||
          c.currency === null ||
          c.currency === t.currency)
      );
    }
    return (
      (c.kind === "int" && c.value === t.value) ||
      (c.kind === "id" && c.value === String(t.value))
    );
  });
}

/**
 * Words that assert a fact without a number must cite the backing fact (05 section 5).
 * Matching is on word stems so "delivery was confirmed" counts as a delivery claim.
 */
export const CLAIM_WORDS: {
  re: RegExp;
  needs: (key: string) => boolean;
  word: string;
}[] = [
  {
    re: /\bdeliver(?:ed|y)\b/i,
    needs: (k) => k === "fulfil.delivered_at",
    word: "delivered",
  },
  {
    re: /\brefund(?:ed)?\b/i,
    needs: (k) => k.startsWith("refund."),
    word: "refunded",
  },
  {
    re: /\bshipped\b/i,
    needs: (k) => k === "fulfil.shipped_at",
    word: "shipped",
  },
];
