"use client";
import { useEffect, useState } from "react";
import { formatMoney, timeLeft, band, stateLabel } from "./format";
import { Badge, type Tone } from "./primitives";

// Domain components (06 section 10).

export function ModeBanner({
  dataMode,
  submitMode,
}: {
  dataMode: "live" | "replay";
  submitMode: "dry-run" | "live";
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Mode">
      <Badge
        tone={dataMode === "live" ? "accent" : "neutral"}
        title={
          dataMode === "live"
            ? "Data comes from the PayPal sandbox"
            : "Recorded sandbox data; nothing is fetched from PayPal"
        }
      >
        {dataMode === "live" ? "Live sandbox" : "Replay data"}
      </Badge>
      <Badge
        tone={submitMode === "live" ? "danger" : "ok"}
        title={
          submitMode === "live"
            ? "Approved submissions are sent to the PayPal sandbox"
            : "Approved submissions are stored, not sent"
        }
      >
        {submitMode === "live" ? "Sends to sandbox" : "Dry run"}
      </Badge>
    </div>
  );
}

/** Re-renders every 30 s; fixed-width digits so it never shifts layout. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const BAND_TONE = {
  OVERDUE: "danger",
  URGENT: "danger",
  SOON: "warn",
  OK: "neutral",
  NONE: "neutral",
} as const;

export function Countdown({
  dueAt,
  now,
}: {
  dueAt: string | null | undefined;
  now?: number;
}) {
  const live = useNow();
  const t = now ?? live;
  const b = band(dueAt, t);
  const text = timeLeft(dueAt, t);
  return (
    <Badge
      tone={BAND_TONE[b]}
      title={
        dueAt
          ? `Due ${new Date(dueAt).toLocaleString()}`
          : "No response deadline"
      }
      className="tabular-nums"
    >
      {b === "URGENT" ? "Urgent · " : ""}
      {b === "OVERDUE" || b === "NONE" ? text : `Due in ${text}`}
    </Badge>
  );
}

export function MoneyAtRisk({
  minor,
  currency,
}: {
  minor: number;
  currency: string;
}) {
  return <span className="tabular-nums">{formatMoney(minor, currency)}</span>;
}

const STRENGTH: Record<string, { tone: Tone; filled: number; label: string }> =
  {
    STRONG: { tone: "ok", filled: 3, label: "Strong" },
    MEDIUM: { tone: "warn", filled: 2, label: "Medium" },
    WEAK: { tone: "danger", filled: 1, label: "Weak" },
  };

/** Three segments plus text, so colour is never the only signal. A checklist result, not a prediction. */
export function StrengthMeter({
  strength,
  checklist,
}: {
  strength: string | null | undefined;
  checklist?: { label: string; status: string }[];
}) {
  const s = strength ? STRENGTH[strength] : undefined;
  const tip = checklist
    ?.map(
      (c) =>
        `${c.status === "MET" ? "✓" : c.status === "CONFLICT" ? "!" : "✗"} ${c.label}`,
    )
    .join("\n");
  if (!s)
    return (
      <Badge title={tip ?? "No evidence checklist for this reason"}>
        Not assessed
      </Badge>
    );
  const colour =
    s.tone === "ok"
      ? "var(--ds-ok)"
      : s.tone === "warn"
        ? "var(--ds-warn)"
        : "var(--ds-danger)";
  return (
    <span className="inline-flex items-center gap-2" title={tip}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-4 rounded-sm"
            style={{ background: i < s.filled ? colour : "var(--ds-line)" }}
          />
        ))}
      </span>
      <span className="text-xs font-medium">Evidence: {s.label}</span>
    </span>
  );
}

const STATE_TONE: Record<string, Tone> = {
  NEEDS_INFO: "warn",
  READY: "accent",
  APPROVED: "info",
  SUBMITTED: "info",
  AWAITING_OUTCOME: "info",
  CLOSED_WON: "ok",
  CLOSED_LOST: "danger",
  CLOSED_ACCEPTED: "neutral",
  EXPIRED: "danger",
  ERROR: "danger",
};

export function StatePill({ state }: { state: string }) {
  return (
    <Badge tone={STATE_TONE[state] ?? "neutral"}>{stateLabel(state)}</Badge>
  );
}

export function CitationChip({
  factKey,
  onOpen,
  onHover,
  active,
}: {
  factKey: string;
  onOpen: (key: string) => void;
  onHover?: (key: string | null) => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(factKey)}
      onMouseEnter={() => onHover?.(factKey)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(factKey)}
      onBlur={() => onHover?.(null)}
      aria-label={`Show source for ${factKey}`}
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] transition focus-visible:outline-2 focus-visible:outline-[var(--ds-accent)] ${active ? "border-[var(--ds-accent)] bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]" : "border-[var(--ds-line)] bg-[var(--ds-surface-2)] text-[var(--ds-muted)] hover:text-[var(--ds-text)]"}`}
    >
      {factKey}
    </button>
  );
}

/** JSON with the cited path highlighted. Paths look like `a.b[0].c` or `a,b` for derived facts. */
export function JsonView({
  value,
  highlight,
}: {
  value: unknown;
  highlight?: string;
}) {
  const parts =
    (highlight ?? "")
      .split(",")[0]
      ?.split(/\.|\[|\]/)
      .filter(Boolean) ?? [];
  const last = parts.at(-1);
  const text = JSON.stringify(value, null, 2);
  const lines = text.split("\n");
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--ds-radius)] bg-[var(--ds-surface-2)] p-3 font-mono text-xs leading-5">
      {lines.map((l, i) => {
        const hit =
          last &&
          new RegExp(
            `^\\s*"${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`,
          ).test(l);
        return (
          <div
            key={i}
            className={
              hit
                ? "rounded bg-[var(--ds-warn-soft)] text-[var(--ds-text)]"
                : undefined
            }
          >
            {l}
          </div>
        );
      })}
    </pre>
  );
}
