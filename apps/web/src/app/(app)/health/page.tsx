"use client";
import type { QueueRow } from "@ds/api-client";
import { Card, type ColDef, Countdown, DataGrid, DeadlineRunwayView, EmptyState, MoneyAtRisk, type RunwayRow, Skeleton, Stat, type StatementRow, StrengthMeter, VerifierLedgerView, formatMoney, reasonLabel } from "@ds/ui";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../lib/api";
import { useData } from "../../../lib/use-data";

// Health dashboard. AG Studio is the target (06 section 6); until its licence is active this is the
// documented fallback: the same widgets as React views plus AG Grid, fed by the same PII-free views.

type DisputeRow = RunwayRow & { reason: string; hours_to_due: number | null; verifier_passed: boolean | null };
const OPEN = new Set(["NEW", "COLLECTING", "READY", "NEEDS_INFO", "APPROVED", "ERROR", null]);

export default function HealthPage() {
  const router = useRouter();
  const data = useData(async () => {
    const [d, s, f, q] = await Promise.all([api.analytics<DisputeRow>("disputes"), api.analytics<StatementRow>("statements"), api.analytics<{ rule: string; status: string }>("risk_flags"), api.disputes()]);
    return { disputes: d.rows, statements: s.rows, flags: f.rows, queue: q.items };
  }, [], 60_000);

  const columns = useMemo<ColDef<QueueRow>[]>(
    () => [
      { headerName: "Time left", field: "sellerResponseDue", sort: "asc", cellRenderer: (p: { data?: QueueRow }) => (p.data ? <Countdown dueAt={p.data.sellerResponseDue} /> : null), minWidth: 150 },
      { headerName: "Dispute", field: "id", cellClass: "font-mono" },
      { headerName: "Reason", field: "reason", valueFormatter: (p) => reasonLabel(String(p.value)) },
      { headerName: "Amount", field: "amountMinor", cellRenderer: (p: { data?: QueueRow }) => (p.data ? <MoneyAtRisk minor={p.data.amountMinor} currency={p.data.currency} /> : null) },
      { headerName: "Strength", field: "strength", cellRenderer: (p: { data?: QueueRow }) => (p.data ? <StrengthMeter strength={p.data.strength} /> : null), minWidth: 160 },
    ],
    [],
  );

  if (!data.data) return <Skeleton rows={8} />;
  const { disputes, statements, flags, queue } = data.data;
  if (disputes.length === 0) return <EmptyState title="No data yet">Load the demo data from Setup, or sync disputes.</EmptyState>;
  const open = disputes.filter((d) => OPEN.has(d.case_state));
  const byCur = Object.entries(open.reduce<Record<string, number>>((m, d) => ({ ...m, [d.currency]: (m[d.currency] ?? 0) + d.amount_minor }), {}));
  const due24 = open.filter((d) => d.hours_to_due !== null && Number(d.hours_to_due) < 24).length;
  const drafted = disputes.filter((d) => d.verifier_passed !== null);
  const reasons = Object.entries(disputes.reduce<Record<string, number>>((m, d) => ({ ...m, [d.reason]: (m[d.reason] ?? 0) + 1 }), {}));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Dispute health</h1>
        <p className="text-sm text-[var(--ds-muted)]">How disputes are trending, and how often the verifier had to step in. No buyer data is used on this page.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Open disputes" value={open.length} />
        <Stat label="Money at risk" value={byCur.map(([c, m]) => formatMoney(m, c)).join(" · ") || "—"} />
        <Stat label="Due within 24 h" value={due24} tone={due24 ? "danger" : undefined} />
      </div>
      <Card title="Deadline runway (next 14 days)">
        <DeadlineRunwayView rows={disputes} onOpen={(id) => router.push(`/disputes/${encodeURIComponent(id)}`)} />
        <p className="mt-2 text-xs text-[var(--ds-muted)]">Size = amount. Colour = evidence strength (green strong, amber medium, red weak, grey not assessed). Diamonds and a text label mark anything due within 24 hours.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Verifier ledger (latest draft per case)">
          <VerifierLedgerView rows={statements} passedFirstTime={{ passed: drafted.filter((d) => d.verifier_passed).length, total: drafted.length }} />
        </Card>
        <Card title="Disputes by urgency">
          <DataGrid rows={queue} columns={columns} getRowId={(r) => r.id} onRowClick={(r) => router.push(`/disputes/${encodeURIComponent(r.id)}`)} height={260} />
        </Card>
        <Card title="Where disputes come from">
          <ul className="space-y-1.5 text-sm">
            {reasons.map(([r, n]) => (
              <li key={r} className="flex items-center gap-2">
                <span className="w-44">{reasonLabel(r)}</span>
                <span className="h-2 flex-1 rounded bg-[var(--ds-surface-2)]">
                  <span className="block h-full rounded bg-[var(--ds-accent)]" style={{ width: `${(n / disputes.length) * 100}%` }} />
                </span>
                <span className="w-6 text-right tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Risk flags">
          <ul className="space-y-1 text-sm">
            {["OPEN", "ACTIONED", "DISMISSED", "AUTO_CLEARED"].map((st) => (
              <li key={st} className="flex justify-between">
                <span>{st.toLowerCase().replace("_", " ")}</span>
                <span className="tabular-nums">{flags.filter((f) => f.status === st).length}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
