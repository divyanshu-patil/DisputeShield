"use client";
import { formatMoney, timeLeft } from "./format";

// Pure views for the Health dashboard (06 section 6). In AG Studio they become custom widgets; without
// it they render directly (documented fallback).

export type RunwayRow = {
  id: string;
  amount_minor: number;
  currency: string;
  seller_response_due: string | null;
  strength: string | null;
  case_state: string | null;
};

const OPEN = new Set([
  "NEW",
  "COLLECTING",
  "READY",
  "NEEDS_INFO",
  "APPROVED",
  "ERROR",
  null,
]);

/** Open disputes on a 14-day line: position = deadline, size = amount, shape + label for urgent/overdue. */
export function DeadlineRunwayView({
  rows,
  now = Date.now(),
  onOpen,
}: {
  rows: RunwayRow[];
  now?: number;
  onOpen?: (id: string) => void;
}) {
  const W = 760;
  const H = 150;
  const pad = 40;
  const span = 14 * 86_400_000;
  const open = rows.filter(
    (r) => OPEN.has(r.case_state) && r.seller_response_due,
  );
  const max = Math.max(1, ...open.map((r) => r.amount_minor));
  const x = (t: number) =>
    pad + Math.min(1, Math.max(0, (t - now) / span)) * (W - 2 * pad);
  const colour = (s: string | null) =>
    s === "STRONG"
      ? "var(--ds-ok)"
      : s === "MEDIUM"
        ? "var(--ds-warn)"
        : s === "WEAK"
          ? "var(--ds-danger)"
          : "var(--ds-muted)";
  if (open.length === 0)
    return (
      <p className="text-sm text-[var(--ds-muted)]">
        No open disputes with a deadline.
      </p>
    );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="group"
      aria-label={`Deadline runway: ${open.length} open disputes over the next 14 days`}
    >
      <line
        x1={pad}
        x2={W - pad}
        y1={H - 30}
        y2={H - 30}
        stroke="var(--ds-line)"
      />
      {[0, 1, 3, 7, 14].map((d) => (
        <g key={d}>
          <line
            x1={x(now + d * 86_400_000)}
            x2={x(now + d * 86_400_000)}
            y1={H - 34}
            y2={H - 26}
            stroke="var(--ds-muted)"
          />
          <text
            x={x(now + d * 86_400_000)}
            y={H - 10}
            fontSize="11"
            textAnchor="middle"
            fill="var(--ds-muted)"
          >
            {d === 0 ? "now" : `+${d}d`}
          </text>
        </g>
      ))}
      {open.map((r, i) => {
        const due = Date.parse(r.seller_response_due ?? "");
        const cx = x(due);
        const cy = 30 + (i % 3) * 28;
        const rad = 6 + 10 * Math.sqrt(r.amount_minor / max);
        const hours = (due - now) / 3_600_000;
        const urgent = hours < 24;
        return (
          <g
            key={r.id}
            role="link"
            tabIndex={0}
            aria-label={`${r.id}, ${formatMoney(r.amount_minor, r.currency)}, ${timeLeft(r.seller_response_due, now)}`}
            onClick={() => onOpen?.(r.id)}
            onKeyDown={(e) => e.key === "Enter" && onOpen?.(r.id)}
            className="cursor-pointer"
          >
            <line
              x1={cx}
              x2={cx}
              y1={cy}
              y2={H - 30}
              stroke="var(--ds-line)"
              strokeDasharray="2 3"
            />
            {urgent ? (
              <rect
                x={cx - rad}
                y={cy - rad}
                width={rad * 2}
                height={rad * 2}
                fill={colour(r.strength)}
                opacity={0.85}
                transform={`rotate(45 ${cx} ${cy})`}
              />
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={rad}
                fill={colour(r.strength)}
                opacity={0.85}
              />
            )}
            <text
              x={cx + rad + 4}
              y={cy + 4}
              fontSize="11"
              fill="var(--ds-text)"
            >
              {r.id}
              {hours <= 0 ? " · overdue" : urgent ? " · <24 h" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type StatementRow = {
  dispute_id: string;
  accepted: boolean;
  reject_reason: string | null;
};

export function VerifierLedgerView({
  rows,
  passedFirstTime,
}: {
  rows: StatementRow[];
  passedFirstTime?: { passed: number; total: number };
}) {
  const accepted = rows.filter((r) => r.accepted).length;
  const reasons = [
    "NO_CITATION",
    "UNKNOWN_FACT",
    "VALUE_MISMATCH",
    "TOO_LONG",
  ].map((k) => ({ k, n: rows.filter((r) => r.reject_reason === k).length }));
  const total = rows.length || 1;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {rows.length}
          </div>
          <div className="text-xs text-[var(--ds-muted)]">
            statements drafted
          </div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums text-[var(--ds-ok)]">
            {accepted}
          </div>
          <div className="text-xs text-[var(--ds-muted)]">
            accepted by the verifier
          </div>
        </div>
        {passedFirstTime ? (
          <div>
            <div className="text-2xl font-semibold tabular-nums">
              {passedFirstTime.passed}/{passedFirstTime.total}
            </div>
            <div className="text-xs text-[var(--ds-muted)]">drafts passed</div>
          </div>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {reasons.map(({ k, n }) => (
          <li key={k} className="flex items-center gap-2">
            <span className="w-36 font-mono text-xs">{k}</span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-[var(--ds-surface-2)]">
              <span
                className="block h-full bg-[var(--ds-danger)]"
                style={{ width: `${(n / total) * 100}%` }}
              />
            </span>
            <span className="w-8 text-right tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
