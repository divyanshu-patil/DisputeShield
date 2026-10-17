"use client";
import type { FulfilmentRow } from "@ds/api-client";
import { ApiError } from "@ds/api-client";
import { Button, Card, type ColDef, DataGrid, EmptyState, ErrorNote, formatDateTime, useToast } from "@ds/ui";
import { type DragEvent, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useData } from "../../../lib/use-data";

const COLUMNS = "order_ref, paypal_transaction_id, carrier, tracking_number, shipped_at, delivered_at, last_scan_at, ship_to_name, ship_to_line1, ship_to_city, ship_to_postal, ship_to_country";

export default function FulfilmentPage() {
  const toast = useToast();
  const rows = useData(() => api.fulfilment(), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; replaced: number } | null>(null);
  const [errors, setErrors] = useState<{ line: number; column?: string; message: string }[] | null>(null);
  const [over, setOver] = useState(false);
  const [text, setText] = useState("");

  async function upload(csv: string) {
    setBusy(true);
    setErrors(null);
    setResult(null);
    try {
      const r = await api.importCsv(csv);
      setResult(r);
      toast(`Imported ${r.imported} row(s). Open the case and press Re-collect to use them.`, "ok");
      await rows.reload();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setErrors(e.details as never);
      else setErrors([{ line: 0, message: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) await upload(await f.text());
  }

  async function downloadSample() {
    const csv = await api.sampleCsv();
    setText(csv);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "fulfilment-demo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = useMemo<ColDef<FulfilmentRow>[]>(
    () => [
      { headerName: "Order", field: "orderRef", minWidth: 100 },
      { headerName: "PayPal transaction", field: "paypalTransactionId", cellClass: "font-mono", minWidth: 180 },
      { headerName: "Carrier", field: "carrier", minWidth: 90 },
      { headerName: "Tracking", field: "trackingNumber", cellClass: "font-mono", minWidth: 190 },
      { headerName: "Shipped", field: "shippedAt", valueFormatter: (p) => formatDateTime(p.value as string), minWidth: 140 },
      { headerName: "Delivered", field: "deliveredAt", valueFormatter: (p) => formatDateTime(p.value as string), minWidth: 140 },
      { headerName: "Postal code", field: "shipToPostal", minWidth: 100 },
      { headerName: "Imported", field: "importedAt", valueFormatter: (p) => formatDateTime(p.value as string), minWidth: 140 },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Fulfilment records</h1>
        <p className="text-sm text-[var(--ds-muted)]">Your shipping records fill gaps PayPal does not have. Your file is your record; PayPal tracking is the authority when both exist.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Upload CSV" actions={<Button size="sm" variant="ghost" onClick={() => void downloadSample()}>Download demo CSV</Button>}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => void onDrop(e)}
            className={`rounded-[var(--ds-radius)] border-2 border-dashed p-6 text-center text-sm ${over ? "border-[var(--ds-accent)] bg-[var(--ds-accent-soft)]" : "border-[var(--ds-line)]"}`}
          >
            <p>Drop a .csv file here, or</p>
            <label className="mt-2 inline-block cursor-pointer text-[var(--ds-accent)] underline">
              choose a file
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void e.target.files?.[0]?.text().then(upload)} />
            </label>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer">…or paste CSV text</summary>
            <label className="sr-only" htmlFor="csv-text">
              CSV text
            </label>
            <textarea id="csv-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} className="ds-input mt-2 w-full py-2 font-mono text-xs" />
            <Button size="sm" variant="primary" busy={busy} disabled={!text.trim()} onClick={() => void upload(text)}>
              Import
            </Button>
          </details>
          {result ? (
            <p className="mt-3 text-sm text-[var(--ds-ok)]">
              Imported {result.imported} row(s){result.replaced ? `, ${result.replaced} replaced` : ""}.
            </p>
          ) : null}
          {errors ? (
            <div className="mt-3">
              <ErrorNote>
                Nothing was imported. Fix these and upload again:
                <ul className="mt-1 list-disc pl-5">
                  {errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      {e.line ? `Line ${e.line}` : "File"}
                      {e.column ? `, ${e.column}` : ""}: {e.message}
                    </li>
                  ))}
                </ul>
              </ErrorNote>
            </div>
          ) : null}
        </Card>
        <Card title="Columns">
          <p className="font-mono text-xs leading-5">{COLUMNS}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ds-muted)]">
            <li>Header row required, in this order. Dates in ISO 8601 (2026-10-10 or 2026-10-10T14:00:00Z).</li>
            <li>One row per PayPal transaction. Importing the same transaction ID again replaces the row.</li>
            <li>If any row has a problem, nothing is imported, so your records never end up half-loaded.</li>
          </ul>
        </Card>
      </div>
      {rows.data && rows.data.items.length === 0 ? <EmptyState title="No records imported yet" /> : rows.data ? <DataGrid rows={rows.data.items} columns={columns} getRowId={(r) => r.paypalTransactionId} height={Math.min(480, 56 + rows.data.items.length * 44)} /> : null}
    </div>
  );
}
