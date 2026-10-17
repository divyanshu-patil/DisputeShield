import type { Money } from "@ds/schemas";

// Money is integer minor units inside core (AGENTS.md rule 10). PayPal sends decimal strings; convert
// here with a currency-aware exponent. ⚠️ zero-decimal list from memory; PayPal lists HUF, JPY, TWD.
const ZERO_DECIMAL = new Set(["HUF", "JPY", "TWD"]);

export const exponent = (currency: string): number =>
  ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;

export class MoneyError extends Error {
  override name = "MoneyError";
}

/** "48.00" (USD) → 4800. Rejects anything that is not a plain decimal with at most `exponent` places. */
export function toMinor(value: string, currency: string): number {
  const exp = exponent(currency);
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m || (m[3]?.length ?? 0) > exp) {
    throw new MoneyError(`not a ${currency} amount: ${value}`);
  }
  const whole = Number(m[2]) * 10 ** exp;
  const frac = Number((m[3] ?? "").padEnd(exp, "0") || "0");
  return (m[1] ? -1 : 1) * (whole + frac);
}

/** 4800, USD → "48.00" (PayPal wire format). */
export function toDecimal(minor: number, currency: string): string {
  const exp = exponent(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  if (exp === 0) return `${sign}${abs}`;
  const unit = 10 ** exp;
  return `${sign}${Math.floor(abs / unit)}.${String(abs % unit).padStart(exp, "0")}`;
}

/** The fact display for money: "USD 48.00" (05 section 2.2). */
export const displayMoney = (m: Money): string =>
  `${m.currency.toUpperCase()} ${toDecimal(m.minor, m.currency)}`;

export function sumByCurrency(items: Money[]): Money[] {
  const totals = new Map<string, number>();
  for (const { currency, minor } of items) {
    totals.set(currency, (totals.get(currency) ?? 0) + minor);
  }
  return [...totals].map(([currency, minor]) => ({ currency, minor }));
}
