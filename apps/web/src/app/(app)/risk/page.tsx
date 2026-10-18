"use client";
import type { RiskFlag } from "@ds/api-client";
import { Badge, Button, Card, type ColDef, DataGrid, EmptyState, ErrorNote, Modal, MoneyAtRisk, Skeleton, formatDateTime, formatMoney, useToast } from "@ds/ui";
import { useMemo, useState } from "react";
import { useShell } from "../../../components/shell";
import { api } from "../../../lib/api";
import { useData } from "../../../lib/use-data";

const RULES: Record<string, { name: string; why: string }> = {
  "R-PROT": { name: "Not protected", why: "Payments outside seller protection are harder to defend if a dispute is opened." },
  "R-ADDR": { name: "Address mismatch", why: "Shipping somewhere other than the PayPal ship-to address weakens an item-not-received case." },
  "R-NOTRACK": { name: "No tracking", why: "Tracking on the PayPal order is what proves delivery; add it before a buyer asks." },
  "R-STUCK": { name: "Tracking stalled", why: "A parcel with no scan for days often turns into an item-not-received dispute." },
};
const SEV = { HIGH: "danger", MEDIUM: "warn", LOW: "neutral" } as const;

export default function RiskPage() {
  const toast = useToast();
  const { health } = useShell();
  const flags = useData(() => api.riskFlags("OPEN"), []);
  const settings = useData(() => api.settings(), []);
  const [selected, setSelected] = useState<RiskFlag | null>(null);
  const [modal, setModal] = useState<"ADD_TRACKING" | "REFUND" | "DISMISS" | null>(null);
  const [scanning, setScanning] = useState(false);

  const columns = useMemo<ColDef<RiskFlag>[]>(
    () => [
      { headerName: "Severity", field: "severity", minWidth: 110, cellRenderer: (p: { data?: RiskFlag }) => (p.data ? <Badge tone={SEV[p.data.severity]}>{p.data.severity.toLowerCase()}</Badge> : null), comparator: (a: string, b: string) => ["LOW", "MEDIUM", "HIGH"].indexOf(a) - ["LOW", "MEDIUM", "HIGH"].indexOf(b), sort: "desc" },
      { headerName: "Rule", field: "rule", minWidth: 150, valueFormatter: (p) => RULES[String(p.value)]?.name ?? String(p.value) },
      { headerName: "Transaction", field: "transactionId", cellClass: "font-mono", minWidth: 180 },
      { headerName: "Amount", field: "amountMinor", minWidth: 100, cellRenderer: (p: { data?: RiskFlag }) => (p.data ? <MoneyAtRisk minor={p.data.amountMinor} currency={p.data.currency} /> : null) },
      { headerName: "Paid", field: "occurredAt", minWidth: 150, valueFormatter: (p) => formatDateTime(p.value as string) },
      { headerName: "Why", field: "reason", flex: 3, minWidth: 320, wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.45", paddingTop: "8px", paddingBottom: "8px" } },
      { headerName: "Suggested", field: "suggestedAction", minWidth: 120, valueFormatter: (p) => (p.value === "ADD_TRACKING" ? "Add tracking" : p.value === "REFUND" ? "Refund" : "Review") },
    ],
    [],
  );

  async function scan() {
    setScanning(true);
    try {
      const r = await api.riskScan(30);
      toast(r.flagged > 0 ? `${r.flagged} new flag(s).` : "Scan done; no new gaps.", "ok");
      await flags.reload();
      await settings.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "danger");
    } finally {
      setScanning(false);
    }
  }

  const rows = flags.data?.items ?? [];
  const th = settings.data?.thresholds;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Risk radar</h1>
          <p className="text-sm text-[var(--ds-muted)]">Gaps in recent payments, found before they become disputes. Data may be up to 3 hours old (PayPal Transaction Search). Last scan {formatDateTime(settings.data?.lastScanAt)}.</p>
        </div>
        <Button onClick={() => void scan()} busy={scanning}>
          Scan now
        </Button>
      </div>
      {flags.error ? <ErrorNote>{flags.error.message}</ErrorNote> : null}
      {flags.loading && !flags.data ? (
        <Skeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="No gaps found in the last 30 days">Scan again after new payments arrive.</EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} onRowClick={setSelected} storageKey="ds-risk-columns" height={Math.min(560, 56 + rows.length * 64)} />
          <Card title={selected ? `${RULES[selected.rule]?.name ?? selected.rule}` : "Select a flag"}>
            {selected ? (
              <div className="space-y-3 text-sm">
                <p>{selected.reason}</p>
                <p className="text-xs text-[var(--ds-muted)]">Why this matters: {RULES[selected.rule]?.why}</p>
                <dl className="grid grid-cols-[8rem_1fr] gap-1 text-xs">
                  <dt className="text-[var(--ds-muted)]">Transaction</dt>
                  <dd className="font-mono">{selected.transactionId}</dd>
                  <dt className="text-[var(--ds-muted)]">Amount</dt>
                  <dd>{formatMoney(selected.amountMinor, selected.currency)}</dd>
                  <dt className="text-[var(--ds-muted)]">Tracking on PayPal</dt>
                  <dd>{selected.trackingOnPaypal ? "Yes" : "No"}</dd>
                  <dt className="text-[var(--ds-muted)]">First seen</dt>
                  <dd>{formatDateTime(selected.firstSeenAt)}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" disabled={!selected.canUpdatePaypal} title={selected.canUpdatePaypal ? undefined : "No PayPal order for this payment"} onClick={() => setModal("ADD_TRACKING")}>
                    Add tracking
                  </Button>
                  <Button size="sm" disabled={!selected.canUpdatePaypal} onClick={() => setModal("REFUND")}>
                    Refund
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setModal("DISMISS")}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--ds-muted)]">Pick a row to see the facts and actions.</p>
            )}
          </Card>
        </div>
      )}
      {th ? (
        <p className="text-xs text-[var(--ds-muted)]">
          Thresholds (assumptions, change them on Setup): no tracking after {th.noTrackingAfterHours} h; tracking stalled after {th.stuckTrackingDays} days; high value from {formatMoney(th.highValueMinor, "USD")} raises severity.
        </p>
      ) : null}
      {selected && modal ? (
        <FlagModal
          flag={selected}
          action={modal}
          dry={health?.submitMode !== "live"}
          onClose={() => setModal(null)}
          onDone={(t) => {
            setModal(null);
            setSelected(null);
            toast(t, "ok");
            void flags.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function FlagModal({ flag, action, dry, onClose, onDone }: { flag: RiskFlag; action: "ADD_TRACKING" | "REFUND" | "DISMISS"; dry: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("USPS");
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("Handled elsewhere");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = formatMoney(flag.amountMinor, flag.currency);
  const valid = action === "ADD_TRACKING" ? /^[A-Za-z0-9-]{4,64}$/.test(tracking) && carrier.length > 1 : action === "REFUND" ? typed.trim() === amount : true;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.flagAction(flag.id, action === "ADD_TRACKING" ? { action, trackingNumber: tracking, carrier } : { action });
      onDone(action === "DISMISS" ? `Dismissed (${reason}).` : r.status === "DRY_RUN_STORED" ? "Stored as a dry run; PayPal was not changed." : "Sent to the PayPal sandbox.");
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)} Nothing was changed.`);
      setBusy(false);
    }
  }

  const title = action === "ADD_TRACKING" ? "Add tracking to the PayPal order" : action === "REFUND" ? `Refund ${amount}` : "Dismiss flag";
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={action === "REFUND" ? "danger" : "primary"} disabled={!valid} busy={busy} onClick={() => void go()}>
            {action === "DISMISS" ? "Dismiss" : dry ? "Store (dry run)" : "Send to sandbox"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {action === "ADD_TRACKING" ? (
          <>
            <label className="block space-y-1">
              <span>Tracking number</span>
              <input value={tracking} onChange={(e) => setTracking(e.target.value.trim())} className="ds-input w-full font-mono" />
            </label>
            <label className="block space-y-1">
              <span>Carrier</span>
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="ds-input w-full">
                {["USPS", "UPS", "FEDEX", "DHL"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-[var(--ds-muted)]">Request: POST /v2/checkout/orders/…/track with the capture ID, this tracking number and carrier, notify_payer false.</p>
          </>
        ) : action === "REFUND" ? (
          <>
            <p>
              A full refund of <strong>{amount}</strong> goes back to the buyer. Request: POST /v2/payments/captures/…/refund with a PayPal-Request-Id, so a retry cannot refund twice.
            </p>
            <label className="block space-y-1">
              <span>Type {amount} to confirm</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className="ds-input w-full" />
            </label>
          </>
        ) : (
          <label className="block space-y-1">
            <span>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="ds-input w-full">
              <option>Handled elsewhere</option>
              <option>Not a risk</option>
              <option>Test order</option>
            </select>
          </label>
        )}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Modal>
  );
}
