"use client";
import type { Thresholds } from "@ds/api-client";
import { Badge, Button, Card, ErrorNote, Skeleton, formatDateTime, useToast } from "@ds/ui";
import { useState } from "react";
import { useShell } from "../../../components/shell";
import { api } from "../../../lib/api";
import { useData } from "../../../lib/use-data";

const tone = (s: string | undefined) => (s === "ok" ? "ok" : s === "down" ? "danger" : "neutral");

export default function SetupPage() {
  const toast = useToast();
  const { health } = useShell();
  const settings = useData(() => api.settings(), [], 15_000);
  const [edited, setTh] = useState<Thresholds | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const th = edited ?? settings.data?.thresholds ?? null;
  const s = settings.data;
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/paypal` : "/api/webhooks/paypal";

  async function save() {
    if (!th) return;
    setSaving(true);
    try {
      await api.setThresholds(th);
      toast("Thresholds saved. They apply from the next risk scan.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "danger");
    } finally {
      setSaving(false);
    }
  }

  if (settings.error && !s) return <ErrorNote>{settings.error.message}</ErrorNote>;
  if (!s) return <Skeleton rows={8} />;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--ds-line)] py-1.5 last:border-0">
      <dt className="text-[var(--ds-muted)]">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
  return (
    <div className="space-y-4">
      <h1>Setup &amp; health</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Modes and connections">
          <dl className="text-sm">
            {row("Data mode", <Badge tone={s.mode === "live" ? "accent" : "info"}>{s.mode === "live" ? "Live sandbox" : "Replay (recorded)"}</Badge>)}
            {row("Submit mode", <Badge tone={s.submitMode === "live" ? "danger" : "ok"}>{s.submitMode === "live" ? "Sends to sandbox" : "Dry run"}</Badge>)}
            {row("PayPal environment", "Sandbox (always)")}
            {row("PayPal app", s.paypalConfigured ? "Configured (ID hidden)" : "Not configured")}
            {row("Webhook", s.webhookConfigured ? "Configured (ID hidden)" : "Not configured. Polling every 5 minutes is the source of truth.")}
            {row("Last webhook", formatDateTime(health?.lastWebhookAt))}
            {row("Last sync", formatDateTime(health?.lastSyncAt))}
            {row("Database", <Badge tone={tone(health?.database)}>{health?.database ?? "…"}</Badge>)}
            {row("LLM (Ollama Cloud)", <Badge tone={tone(health?.llm)}>{s.llmModel ? `${s.llmModel} · ${health?.llm ?? "…"}` : "not connected: drafts use the plain template"}</Badge>)}
            {row("Job backend", s.jobBackend === "render" ? "Render Workflows" : `Postgres queue${health?.inlineWorker ? " (inline worker)" : ""}`)}
          </dl>
        </Card>
        <Card title="Risk thresholds" actions={<Badge tone="warn">Assumptions you can change</Badge>}>
          {th ? (
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Flag no tracking after (hours)</span>
                <input type="number" min={1} max={720} value={th.noTrackingAfterHours} onChange={(e) => setTh({ ...th, noTrackingAfterHours: Number(e.target.value) })} className="ds-input w-24 text-right tabular-nums" />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Tracking stalled after (days)</span>
                <input type="number" min={1} max={60} value={th.stuckTrackingDays} onChange={(e) => setTh({ ...th, stuckTrackingDays: Number(e.target.value) })} className="ds-input w-24 text-right tabular-nums" />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>High value from (USD)</span>
                <input type="number" min={1} step={1} value={th.highValueMinor / 100} onChange={(e) => setTh({ ...th, highValueMinor: Math.round(Number(e.target.value) * 100) })} className="ds-input w-24 text-right tabular-nums" />
              </label>
              <Button variant="primary" size="sm" busy={saving} onClick={() => void save()}>
                Save thresholds
              </Button>
            </div>
          ) : null}
        </Card>
        <Card title="PayPal webhook">
          <div className="space-y-2 text-sm">
            <p>
              Register this URL in the PayPal developer dashboard (your sandbox app → Webhooks) for <span className="font-mono text-xs">CUSTOMER.DISPUTE.CREATED</span>, <span className="font-mono text-xs">UPDATED</span> and <span className="font-mono text-xs">RESOLVED</span>, then put the webhook ID in <span className="font-mono text-xs">PAYPAL_WEBHOOK_ID</span>.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded bg-[var(--ds-surface-2)] px-2 py-1 text-xs">{webhookUrl}</code>
              <Button size="sm" onClick={() => void navigator.clipboard.writeText(webhookUrl).then(() => toast("Copied.", "ok"))}>
                Copy
              </Button>
            </div>
            <p className="text-xs text-[var(--ds-muted)]">The sandbox did not emit real dispute events in our tests, so the 5-minute sync remains the source of truth; webhooks only speed it up.</p>
          </div>
        </Card>
        <Card title="Demo data">
          <div className="space-y-2 text-sm">
            <p>Reloads the four demo disputes and two risk payments for Hearthside Ceramics. The audit trail is kept.</p>
            <Button
              disabled={s.mode !== "replay"}
              busy={seeding}
              onClick={() => {
                setSeeding(true);
                void api
                  .seedDemo()
                  .then(() => toast("Demo data reloaded.", "ok"))
                  .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), "danger"))
                  .finally(() => setSeeding(false));
              }}
            >
              Reload demo data
            </Button>
            {s.mode !== "replay" ? <p className="text-xs text-[var(--ds-muted)]">Only in replay mode.</p> : null}
          </div>
        </Card>
      </div>
      <Card title="Recent jobs">
        {s.jobs.length === 0 ? (
          <p className="text-sm text-[var(--ds-muted)]">{s.jobBackend === "render" ? "Jobs run as Render Workflows tasks; see the Render dashboard for run history." : "No jobs yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--ds-muted)]">
                <tr>
                  <th className="py-1">Kind</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Created</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {s.jobs.map((j) => (
                  <tr key={j.id} className="border-t border-[var(--ds-line)]">
                    <td className="py-1 font-mono text-xs">{j.kind}</td>
                    <td>
                      <Badge tone={j.status === "DONE" ? "ok" : j.status === "DEAD" ? "danger" : j.status === "FAILED" ? "warn" : "neutral"}>{j.status.toLowerCase()}</Badge>
                    </td>
                    <td className="tabular-nums">
                      {j.attempts}/{j.max_attempts}
                    </td>
                    <td>{formatDateTime(j.created_at)}</td>
                    <td className="max-w-xs truncate text-xs text-[var(--ds-danger)]" title={j.last_error ?? ""}>
                      {j.last_error ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
