"use client";
import type { AuditRow } from "@ds/api-client";
import { Button, type ColDef, DataGrid, ErrorNote, Skeleton, formatDateTime } from "@ds/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useData } from "../../../lib/use-data";

export default function AuditPage() {
  const audit = useData(() => api.audit(), []);
  const [q, setQ] = useState("");
  const columns = useMemo<ColDef<AuditRow>[]>(
    () => [
      { headerName: "Time", field: "at", valueFormatter: (p) => formatDateTime(p.value as string), minWidth: 170, sort: "desc" },
      { headerName: "Actor", field: "actor", minWidth: 90 },
      { headerName: "Action", field: "action", minWidth: 170 },
      { headerName: "Dispute", field: "disputeId", minWidth: 120, cellRenderer: (p: { value?: string | null }) => (p.value ? <Link href={`/disputes/${encodeURIComponent(p.value)}`}>{p.value}</Link> : "-") },
      { headerName: "Detail", field: "detail", flex: 3, minWidth: 260, valueFormatter: (p) => (p.value ? JSON.stringify(p.value) : "") },
    ],
    [],
  );
  const rows = audit.data?.items ?? [];
  function exportCsv() {
    const esc = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;
    const csv = ["at,actor,action,dispute_id,flag_id,detail", ...rows.map((r) => [r.at, r.actor, r.action, r.disputeId, r.flagId, r.detail ? JSON.stringify(r.detail) : ""].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Audit trail</h1>
          <p className="text-sm text-[var(--ds-muted)]">Every approval, submission and change, newest first. Append-only: entries cannot be edited or deleted.</p>
        </div>
        <div className="flex gap-2">
          <input type="search" aria-label="Filter audit" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} className="ds-input w-48" />
          <Button onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>
      {audit.error ? <ErrorNote>{audit.error.message}</ErrorNote> : null}
      {audit.loading && !audit.data ? <Skeleton rows={8} /> : <DataGrid rows={rows} columns={columns} quickFilter={q} getRowId={(r) => String(r.id)} height={620} />}
    </div>
  );
}
