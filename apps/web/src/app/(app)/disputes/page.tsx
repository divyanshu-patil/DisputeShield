"use client";
import type { QueueRow } from "@ds/api-client";
import {
  ACTION_LABELS,
  Button,
  type ColDef,
  Countdown,
  DataGrid,
  EmptyState,
  ErrorNote,
  MoneyAtRisk,
  Skeleton,
  Stat,
  StatePill,
  StrengthMeter,
  useNow,
  formatDateTime,
  formatMoney,
  reasonLabel,
  stageLabel,
  stateLabel,
} from "@ds/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useShell } from "../../../components/shell";
import { api } from "../../../lib/api";
import { useData } from "../../../lib/use-data";

const OPEN = new Set(["NEW", "COLLECTING", "READY", "NEEDS_INFO", "APPROVED", "ERROR"]);

function Queue() {
  const router = useRouter();
  const params = useSearchParams();
  const { health } = useShell();
  const q = useData(() => api.disputes(), [], 20_000);
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [text, setText] = useState(params.get("q") ?? "");
  const stateFilter = params.get("state") ?? "";
  const reasonFilter = params.get("reason") ?? "";

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.replace(`/disputes?${p.toString()}`);
  };

  const rows = useMemo(
    () => (q.data?.items ?? []).filter((r) => (!stateFilter || r.caseState === stateFilter) && (!reasonFilter || r.reason === reasonFilter)),
    [q.data, stateFilter, reasonFilter],
  );
  const all = q.data?.items ?? [];
  const now = useNow();
  const open = all.filter((r) => OPEN.has(r.caseState));
  const due24 = open.filter((r) => r.sellerResponseDue && Date.parse(r.sellerResponseDue) - now < 24 * 3_600_000).length;
  const atRisk = Object.entries(open.reduce<Record<string, number>>((m, r) => ({ ...m, [r.currency]: (m[r.currency] ?? 0) + r.amountMinor }), {}));
  const awaiting = all.filter((r) => r.caseState === "SUBMITTED" || r.caseState === "AWAITING_OUTCOME").length;

  const columns = useMemo<ColDef<QueueRow>[]>(
    () => [
      { headerName: "Time left", colId: "due", field: "sellerResponseDue", sort: "asc", minWidth: 200, cellRenderer: (p: { data?: QueueRow }) => (p.data ? <Countdown dueAt={p.data.sellerResponseDue} /> : null), comparator: (a: string | null, b: string | null) => (a ? Date.parse(a) : Infinity) - (b ? Date.parse(b) : Infinity) },
      { headerName: "Dispute", field: "id", minWidth: 120, cellClass: "font-mono" },
      { headerName: "Reason", field: "reason", valueFormatter: (p) => reasonLabel(String(p.value)), minWidth: 170 },
      { headerName: "Amount", field: "amountMinor", minWidth: 110, cellRenderer: (p: { data?: QueueRow }) => (p.data ? <MoneyAtRisk minor={p.data.amountMinor} currency={p.data.currency} /> : null), getQuickFilterText: (p) => formatMoney(p.data.amountMinor, p.data.currency) },
      { headerName: "Stage", field: "stage", valueFormatter: (p) => stageLabel(String(p.value)), minWidth: 100 },
      { headerName: "Evidence strength", field: "strength", minWidth: 210, cellRenderer: (p: { data?: QueueRow }) => (p.data ? <StrengthMeter strength={p.data.strength} /> : null) },
      { headerName: "Case state", field: "caseState", minWidth: 140, cellRenderer: (p: { data?: QueueRow }) => (p.data ? <StatePill state={p.data.caseState} /> : null), getQuickFilterText: (p) => stateLabel(p.data.caseState) },
      { headerName: "Recommended", field: "recommendedAction", minWidth: 120, valueFormatter: (p) => (p.value ? (ACTION_LABELS[String(p.value)] ?? String(p.value)) : "—") },
    ],
    [],
  );

  async function syncAll() {
    setSyncing(true);
    try {
      await api.syncAll();
      setTimeout(() => void q.reload().finally(() => setSyncing(false)), 1500);
    } catch {
      setSyncing(false);
    }
  }

  const states = [...new Set(all.map((r) => r.caseState))];
  const reasons = [...new Set(all.map((r) => r.reason))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Disputes</h1>
          <p className="text-sm text-[var(--ds-muted)]">Nearest deadline first. Last synced {formatDateTime(health?.lastSyncAt)}.</p>
        </div>
        <Button onClick={() => void syncAll()} busy={syncing} disabled={all.length === 0}>
          Sync now
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Needs action" value={open.length} />
        <Stat label="Due within 24 h" value={due24} tone={due24 > 0 ? "danger" : undefined} />
        <Stat label="Amount at risk" value={atRisk.length ? atRisk.map(([c, m]) => formatMoney(m, c)).join(" · ") : "—"} />
        <Stat label="Submitted, awaiting outcome" value={awaiting} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Filter disputes"
          placeholder="Filter…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setParam("q", text)}
          className="w-56 rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-sm"
        />
        <select aria-label="Case state" value={stateFilter} onChange={(e) => setParam("state", e.target.value)} className="rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 text-sm">
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {stateLabel(s)}
            </option>
          ))}
        </select>
        <select aria-label="Reason" value={reasonFilter} onChange={(e) => setParam("reason", e.target.value)} className="rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 text-sm">
          <option value="">All reasons</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {reasonLabel(r)}
            </option>
          ))}
        </select>
      </div>

      {q.error && !q.data ? <ErrorNote>Could not load disputes: {q.error.message}. Nothing was changed. Try again in a moment.</ErrorNote> : null}
      {q.loading && !q.data ? (
        <Skeleton rows={6} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No disputes yet"
          action={
            health?.mode === "replay" ? (
              <Button
                variant="primary"
                busy={seeding}
                onClick={() => {
                  setSeeding(true);
                  void api.seedDemo().finally(() => void q.reload().finally(() => setSeeding(false)));
                }}
              >
                Load demo data
              </Button>
            ) : null
          }
        >
          Disputes appear here after a sync. {health?.mode === "replay" ? "Load the demo shop's data to explore." : "Use Sync now."}
        </EmptyState>
      ) : (
        <DataGrid rows={rows} columns={columns} quickFilter={text} storageKey="ds-queue-columns" getRowId={(r) => r.id} onRowClick={(r) => router.push(`/disputes/${encodeURIComponent(r.id)}`)} height={Math.min(560, 56 + rows.length * 44)} />
      )}
    </div>
  );
}

export default function DisputesPage() {
  return (
    <Suspense>
      <Queue />
    </Suspense>
  );
}
