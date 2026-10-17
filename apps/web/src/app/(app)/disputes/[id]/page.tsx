"use client";
import { ApiError, type CaseFile, type EvidenceDraft, type Fact, type Payload, type Statement, type Submission } from "@ds/api-client";
import {
  ACTION_LABELS,
  Badge,
  Button,
  Card,
  CitationChip,
  Countdown,
  Drawer,
  EmptyState,
  ErrorNote,
  JsonView,
  Modal,
  ModeBanner,
  MoneyAtRisk,
  Skeleton,
  StatePill,
  StrengthMeter,
  formatDateTime,
  formatMoney,
  reasonLabel,
  stageLabel,
  useToast,
} from "@ds/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useShell } from "../../../../components/shell";
import { api } from "../../../../lib/api";
import { useData } from "../../../../lib/use-data";

const GROUPS: [string, (k: string) => boolean][] = [
  ["Dispute", (k) => k.startsWith("dispute.")],
  ["Payment", (k) => k.startsWith("txn.")],
  ["Shipping", (k) => k.startsWith("tracking.") || k.startsWith("order.")],
  ["Refund", (k) => k.startsWith("refund.")],
  ["Your records", (k) => k.startsWith("fulfil.")],
  ["Derived", (k) => k.startsWith("derived.")],
];
const SOURCE: Record<Fact["confidence"], string> = { PAYPAL: "PayPal", SELLER_UPLOAD: "Your file", DERIVED: "Derived" };
const BUSY_STATES = new Set(["NEW", "COLLECTING"]);

const msg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const disputeId = decodeURIComponent(id);
  const toast = useToast();
  const mode = useShell().health?.mode ?? "replay";
  const file = useData(() => api.caseFile(disputeId), [disputeId]);
  const audit = useData(() => api.audit(disputeId), [disputeId]);
  const [hover, setHover] = useState<string | null>(null);
  const [source, setSource] = useState<{ fact: Fact; payload: Payload | null; error?: string } | null>(null);
  const [approve, setApprove] = useState<"PROVIDE_EVIDENCE" | "ACCEPT_CLAIM" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const c = file.data;
  const state = c?.case?.state ?? "NEW";
  // Poll while jobs work on the case, or while a new draft is expected.
  const pending = BUSY_STATES.has(state) || (state === "READY" && !c?.draft && c?.kind !== "GENERIC");
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      void file.reload();
      void audit.reload();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, c]);

  async function openSource(key: string) {
    const fact = c?.facts.find((f) => f.key === key);
    if (!fact) return;
    setSource({ fact, payload: null });
    try {
      setSource({ fact, payload: await api.payload(fact.sourcePayloadId) });
    } catch (e) {
      setSource({ fact, payload: null, error: msg(e) });
    }
  }

  async function act(name: string, fn: () => Promise<unknown>, done: string) {
    setBusy(name);
    try {
      await fn();
      toast(done, "ok");
      await Promise.all([file.reload(), audit.reload()]);
    } catch (e) {
      toast(msg(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  if (file.error && !c) return <ErrorNote>Could not load this dispute: {file.error.message}</ErrorNote>;
  if (!c) return <Skeleton rows={8} />;

  const d = c.dispute;
  const canFight = d.allowedActions?.includes("provide_evidence") ?? false;
  const canAccept = d.allowedActions?.includes("accept_claim") ?? false;
  const overdue = c.decision.deadline.band === "OVERDUE";
  const fightBlocked = !canFight
    ? "PayPal is not asking for evidence on this dispute (no provide_evidence link)."
    : overdue
      ? "The deadline has passed."
      : state !== "READY"
        ? `The case is ${state.toLowerCase().replace("_", " ")}.`
        : !c.draft
          ? "No draft yet."
          : !c.draft.passed
            ? "The verifier has not passed the draft."
            : null;
  const acceptBlocked = !canAccept ? "PayPal offers no accept-claim link for this dispute." : overdue ? "The deadline has passed." : !["NEW", "READY", "NEEDS_INFO", "ERROR"].includes(state) ? "The case is no longer open for a response." : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/disputes" className="text-xs no-underline">
            ← Disputes
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <span className="font-mono">{d.id}</span>
            <span className="text-[var(--ds-muted)]">·</span>
            <span>{reasonLabel(d.reason)}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <MoneyAtRisk minor={d.amountMinor} currency={d.currency} />
            <Badge>{stageLabel(d.stage)}</Badge>
            <Badge title="Status at PayPal">PayPal: {d.paypalStatus.toLowerCase().replaceAll("_", " ")}</Badge>
            <StatePill state={state} />
            <Countdown dueAt={d.sellerResponseDue} />
          </div>
        </div>
        <ModeBanner dataMode={mode} submitMode={c.submitMode} />
      </div>

      <StateBanner c={c} onRecollect={() => void act("collect", () => api.collect(disputeId), "Re-collecting facts…")} busy={busy === "collect"} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.9fr)]">
        {/* Left: case file */}
        <div className="space-y-4">
          <Card title="Checklist">
            {c.checklist.length === 0 ? (
              <p className="text-sm text-[var(--ds-muted)]">No evidence checklist for this reason. Dispute Shield does not draft evidence for it yet; the facts below are your manual packet.</p>
            ) : (
              <ul className="space-y-2">
                {c.checklist.map((i) => (
                  <li key={i.key} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span aria-hidden className={i.status === "MET" ? "text-[var(--ds-ok)]" : i.status === "CONFLICT" ? "text-[var(--ds-warn)]" : "text-[var(--ds-danger)]"}>
                        {i.status === "MET" ? "✓" : i.status === "CONFLICT" ? "!" : "✗"}
                      </span>
                      <span className="flex-1">
                        {i.label}
                        <span className="sr-only">: {i.status}</span>
                        {i.blocking ? <span className="ml-1 text-xs text-[var(--ds-muted)]">(required)</span> : null}
                      </span>
                      <Badge tone={i.status === "MET" ? "ok" : i.status === "CONFLICT" ? "warn" : "danger"}>{i.status === "MET" ? "Met" : i.status === "CONFLICT" ? "Conflict" : "Missing"}</Badge>
                    </div>
                    {i.status !== "MET" && i.fix ? (
                      <p className="ml-5 mt-1 text-xs text-[var(--ds-muted)]">
                        {i.fix} {i.fix.includes("CSV") ? <Link href="/fulfilment">Open Fulfilment</Link> : null}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Facts (${c.facts.length})`}>
            {c.facts.length === 0 ? (
              <p className="text-sm text-[var(--ds-muted)]">No facts collected yet.</p>
            ) : (
              <div className="space-y-4">
                {GROUPS.map(([name, test]) => {
                  const facts = c.facts.filter((f) => test(f.key));
                  if (facts.length === 0) return null;
                  return (
                    <div key={name}>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-muted)]">{name}</h3>
                      <dl className="space-y-1">
                        {facts.map((f) => (
                          <div key={f.key} className={`flex items-start gap-2 rounded px-1.5 py-1 text-sm ${hover === f.key ? "bg-[var(--ds-accent-soft)]" : ""}`}>
                            <dt className="w-36 shrink-0 text-[var(--ds-muted)]">{f.label}</dt>
                            <dd className="min-w-0 flex-1 break-words tabular-nums">{f.display}</dd>
                            <Badge tone={f.confidence === "PAYPAL" ? "info" : f.confidence === "SELLER_UPLOAD" ? "warn" : "neutral"}>{SOURCE[f.confidence]}</Badge>
                            <button type="button" onClick={() => void openSource(f.key)} className="text-xs" aria-label={`View source of ${f.label}`}>
                              source
                            </button>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Centre: decision and draft */}
        <div className="space-y-4">
          <DecisionPanel c={c} />
          <DraftPanel c={c} disputeId={disputeId} hover={hover} setHover={setHover} openSource={(k) => void openSource(k)} onChanged={() => void Promise.all([file.reload(), audit.reload()])} />
        </div>

        {/* Right: actions and history */}
        <div className="space-y-4">
          <Card title="Actions">
            <div className="space-y-2">
              <ActionButton label="Approve & send evidence" variant="primary" blocked={fightBlocked} onClick={() => setApprove("PROVIDE_EVIDENCE")} />
              <ActionButton label="Accept claim and refund" variant="secondary" blocked={acceptBlocked} onClick={() => setApprove("ACCEPT_CLAIM")} />
              <ActionButton
                label="Regenerate draft"
                variant="ghost"
                busy={busy === "regen"}
                blocked={state !== "READY" ? "Drafts are made when the case is Ready." : c.kind === "GENERIC" ? "No drafting for this reason yet." : null}
                onClick={() => void act("regen", () => api.regenerate(disputeId), "Drafting started; the new version appears shortly.")}
              />
              <ActionButton label="Sync from PayPal" variant="ghost" busy={busy === "sync"} blocked={null} onClick={() => void act("sync", () => api.syncDispute(disputeId), "Sync requested.")} />
            </div>
          </Card>
          <SubmissionsCard subs={c.submissions} />
          <Card title="Timeline">
            {(audit.data?.items ?? []).length === 0 ? (
              <p className="text-sm text-[var(--ds-muted)]">Nothing yet.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {(audit.data?.items ?? []).map((a) => (
                  <li key={a.id} className="border-l-2 border-[var(--ds-line)] pl-2">
                    <div className="font-medium">{a.action.replaceAll("_", " ").toLowerCase()}</div>
                    <div className="text-xs text-[var(--ds-muted)]">
                      {formatDateTime(a.at)} · {a.actor}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Drawer open={!!source} onClose={() => setSource(null)} title={source ? `Source: ${source.fact.label}` : "Source"}>
        {source ? (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[8rem_1fr] gap-1">
              <dt className="text-[var(--ds-muted)]">Fact key</dt>
              <dd className="font-mono">{source.fact.key}</dd>
              <dt className="text-[var(--ds-muted)]">Value</dt>
              <dd>{source.fact.display}</dd>
              <dt className="text-[var(--ds-muted)]">From</dt>
              <dd>{source.payload ? `${source.payload.source} ${source.payload.ref}` : SOURCE[source.fact.confidence]}</dd>
              <dt className="text-[var(--ds-muted)]">JSON path</dt>
              <dd className="font-mono break-all">{source.fact.jsonPath}</dd>
              <dt className="text-[var(--ds-muted)]">Fetched</dt>
              <dd>{formatDateTime(source.fact.fetchedAt)}</dd>
            </dl>
            {source.error ? <ErrorNote>{source.error}</ErrorNote> : source.payload ? <JsonView value={source.payload.payload} highlight={source.fact.jsonPath} /> : <Skeleton rows={4} />}
            <p className="text-xs text-[var(--ds-muted)]">Names, emails and street lines are masked in this view.</p>
          </div>
        ) : null}
      </Drawer>

      {approve ? (
        <ApproveModal
          action={approve}
          c={c}
          disputeId={disputeId}
          onClose={() => setApprove(null)}
          onDone={(status) => {
            setApprove(null);
            toast(status === "DRY_RUN_STORED" ? "Stored as a dry run. Nothing was sent to PayPal." : "Sent to the PayPal sandbox.", "ok");
            void Promise.all([file.reload(), audit.reload()]);
          }}
        />
      ) : null}
    </div>
  );
}

function ActionButton({ label, blocked, onClick, variant, busy }: { label: string; blocked: string | null; onClick: () => void; variant: "primary" | "secondary" | "ghost"; busy?: boolean }) {
  return (
    <div>
      <Button className="w-full" variant={variant} disabled={!!blocked} busy={busy} onClick={onClick} aria-describedby={blocked ? `why-${label}` : undefined}>
        {label}
      </Button>
      {blocked ? (
        <p id={`why-${label}`} className="mt-1 text-xs text-[var(--ds-muted)]">
          {blocked}
        </p>
      ) : null}
    </div>
  );
}

function StateBanner({ c, onRecollect, busy }: { c: CaseFile; onRecollect: () => void; busy: boolean }) {
  const s = c.case?.state ?? "NEW";
  if (s === "NEW" || s === "COLLECTING")
    return (
      <div role="status" className="rounded-[var(--ds-radius)] bg-[var(--ds-info-soft)] px-3 py-2 text-sm text-[var(--ds-info)]">
        Collecting facts: dispute → payment → order → your file…
      </div>
    );
  if (s === "NEEDS_INFO")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-radius)] bg-[var(--ds-warn-soft)] px-3 py-2 text-sm text-[var(--ds-warn)]">
        <div>
          <strong>Needs info.</strong> {c.needsInfo.join(" ")}{" "}
          <Link href="/fulfilment">Upload your fulfilment CSV</Link>, then re-collect.
        </div>
        <Button size="sm" onClick={onRecollect} busy={busy}>
          Re-collect
        </Button>
      </div>
    );
  if (s === "ERROR")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ErrorNote>Collecting this case failed: {c.case?.errorDetail ?? "unknown error"}. Nothing was sent to PayPal.</ErrorNote>
        <Button size="sm" onClick={onRecollect} busy={busy}>
          Retry
        </Button>
      </div>
    );
  if (s === "EXPIRED") return <ErrorNote>The response deadline passed with nothing sent. This case is read-only; PayPal decides it without your evidence.</ErrorNote>;
  const closed: Record<string, [string, string]> = {
    CLOSED_WON: ["ok", "Resolved in your favour."],
    CLOSED_LOST: ["danger", "Resolved in the buyer's favour."],
    CLOSED_ACCEPTED: ["neutral", "You accepted the claim; PayPal resolved it."],
    SUBMITTED: ["info", "Submitted. PayPal is reviewing; the outcome appears here after the next sync."],
    AWAITING_OUTCOME: ["info", "PayPal is reviewing your response."],
  };
  const x = closed[s];
  if (!x) return null;
  return (
    <div role="status" className="rounded-[var(--ds-radius)] px-3 py-2 text-sm" style={{ background: `var(--ds-${x[0] === "neutral" ? "surface-2" : `${x[0]}-soft`})`, color: `var(--ds-${x[0] === "neutral" ? "muted" : x[0]})` }}>
      {x[1]}
    </div>
  );
}

function DecisionPanel({ c }: { c: CaseFile }) {
  const d = c.decision;
  const tone = d.recommended === "FIGHT" ? "ok" : d.recommended === "ACCEPT" ? "warn" : "info";
  return (
    <Card title="Decision aid" actions={<StrengthMeter strength={c.strength} checklist={c.checklist} />}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--ds-muted)]">Recommended:</span>
          <Badge tone={tone} className="text-sm">
            {ACTION_LABELS[d.recommended] ?? d.recommended}
          </Badge>
          <span className="text-[var(--ds-muted)]">
            · At risk {formatMoney(d.amountAtRisk.minor, d.amountAtRisk.currency)} · {d.costOfFighting}
          </span>
        </div>
        <ul className="list-disc space-y-1 pl-5">
          {d.because.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {d.blockers.length > 0 ? (
          <div className="rounded bg-[var(--ds-danger-soft)] px-3 py-2 text-[var(--ds-danger)]">
            <strong>Blocked:</strong> {d.blockers.join(" ")}
          </div>
        ) : null}
        <details>
          <summary className="cursor-pointer text-xs text-[var(--ds-muted)]">How this is decided</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ds-muted)]">
            {c.rubric.map((r) => (
              <li key={r}>{r}</li>
            ))}
            <li>Strength is a checklist result from your records, not a prediction of the outcome.</li>
          </ul>
        </details>
      </div>
    </Card>
  );
}

function DraftPanel({ c, disputeId, hover, setHover, openSource, onChanged }: { c: CaseFile; disputeId: string; hover: string | null; setHover: (k: string | null) => void; openSource: (k: string) => void; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Statement[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<{ passed: boolean; rejected: { statement: Statement; reason: string; detail?: string }[] } | null>(null);
  const draft = c.draft;

  if (c.kind === "GENERIC")
    return (
      <Card title="Evidence draft">
        <EmptyState title="Dispute Shield does not draft evidence for this reason yet">The facts on the left are your manual packet. You can still accept the claim if PayPal allows it.</EmptyState>
      </Card>
    );
  if (!draft)
    return (
      <Card title="Evidence draft">
        <p className="text-sm text-[var(--ds-muted)]">{c.case?.state === "READY" ? "Drafting…" : "A draft is made once every required item on the checklist is met."}</p>
      </Card>
    );

  const accepted = draft.report.accepted;
  const total = accepted.length + draft.report.rejected.length;
  const origin =
    draft.origin === "TEMPLATE_FALLBACK"
      ? "Plain template (AI drafting unavailable)"
      : draft.origin === "HUMAN_EDIT"
        ? "Edited by you"
        : `AI-drafted by ${draft.model ?? "model"} (prompt ${draft.promptVersion ?? "drafter.v1"})${draft.origin === "MODEL_REPAIRED" ? ", repaired once" : ""}`;
  const editable = c.case?.state === "READY";

  async function check() {
    if (!editing || !draft) return;
    setChecking(true);
    const next: EvidenceDraft = { ...draft.content, statements: editing.filter((s) => s.text.trim()) };
    try {
      const r = await api.verifyDraft(disputeId, next);
      setLastCheck({ passed: r.passed, rejected: r.report.rejected });
      if (r.passed) {
        toast(`Saved as version ${r.version}; every statement verified.`, "ok");
        setEditing(null);
        setLastCheck(null);
      } else toast("Some edits did not pass the verifier. The previous passing version stays approvable.", "warn");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "danger");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Evidence draft v{draft.version}
          {draft.passed ? <Badge tone="ok">✓ Verified</Badge> : <Badge tone="danger">Not verified</Badge>}
        </span>
      }
      actions={
        editable && !editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(accepted.map((s) => ({ ...s })))}>
            Edit
          </Button>
        ) : null
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-[var(--ds-muted)]">
          {origin} · {accepted.length} of {total} statements verified · {draft.content.evidenceType.replaceAll("_", " ").toLowerCase()}
        </p>
        {editing ? (
          <div className="space-y-3">
            {editing.map((s, i) => (
              <div key={i} className="space-y-1">
                <label className="sr-only" htmlFor={`st-${i}`}>
                  Statement {i + 1}
                </label>
                <textarea
                  id={`st-${i}`}
                  rows={2}
                  value={s.text}
                  onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  className="w-full rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-bg)] p-2 text-sm"
                />
                <div className="flex items-center gap-1">
                  {s.factKeys.map((k) => (
                    <CitationChip key={k} factKey={k} onOpen={openSource} onHover={setHover} active={hover === k} />
                  ))}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(editing.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            {lastCheck && !lastCheck.passed ? (
              <ErrorNote>
                {lastCheck.rejected.length > 0
                  ? lastCheck.rejected.map((r) => `"${r.statement.text.slice(0, 60)}…" — ${r.reason.replaceAll("_", " ").toLowerCase()}${r.detail ? `: ${r.detail}` : ""}`).join(" | ")
                  : "At least one statement is needed."}
              </ErrorNote>
            ) : null}
            <div className="flex gap-2">
              <Button variant="primary" size="sm" busy={checking} onClick={() => void check()}>
                Check with verifier
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setLastCheck(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <ol className="space-y-2">
            {accepted.map((s, i) => (
              <li key={i} className="rounded border border-[var(--ds-line)] p-2">
                <p>{s.text}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.factKeys.map((k) => (
                    <CitationChip key={k} factKey={k} onOpen={openSource} onHover={setHover} active={hover === k} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
        {draft.report.rejected.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs text-[var(--ds-danger)]">Removed by verifier ({draft.report.rejected.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {draft.report.rejected.map((r, i) => (
                <li key={i}>
                  <span className="font-mono">{r.reason}</span>: {r.statement.text} {r.detail ? <span className="text-[var(--ds-muted)]">({r.detail})</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <details>
          <summary className="cursor-pointer text-xs text-[var(--ds-muted)]">Notes text sent to PayPal ({draft.report.notesText.length}/2000)</summary>
          <p className="mt-2 whitespace-pre-wrap rounded bg-[var(--ds-surface-2)] p-2 text-xs">{draft.report.notesText}</p>
        </details>
      </div>
    </Card>
  );
}

function SubmissionsCard({ subs }: { subs: Submission[] }) {
  if (subs.length === 0) return null;
  return (
    <Card title="Submissions">
      <ul className="space-y-3 text-sm">
        {subs.map((s) => (
          <li key={s.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge tone={s.status === "SENT" ? "ok" : s.status === "DRY_RUN_STORED" ? "info" : s.status === "FAILED" ? "danger" : "neutral"}>{s.status === "DRY_RUN_STORED" ? "Dry run stored" : s.status.toLowerCase()}</Badge>
              <span>{s.action === "ACCEPT_CLAIM" ? "Accept claim" : "Provide evidence"}</span>
            </div>
            <div className="text-xs text-[var(--ds-muted)]">Approved {formatDateTime(s.approvedAt)}{s.sentAt ? ` · stored ${formatDateTime(s.sentAt)}` : ""}</div>
            {s.errorDetail ? <ErrorNote>{s.errorDetail}</ErrorNote> : null}
            <details>
              <summary className="cursor-pointer text-xs">Exact request</summary>
              <JsonView value={s.requestSnapshot} />
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ApproveModal({ action, c, disputeId, onClose, onDone }: { action: "PROVIDE_EVIDENCE" | "ACCEPT_CLAIM"; c: CaseFile; disputeId: string; onClose: () => void; onDone: (status: string) => void }) {
  const preview = useData(() => api.preview(disputeId, action), [action]);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dry = c.submitMode === "dry-run";
  const mode = useShell().health?.mode ?? "replay";
  const amount = formatMoney(c.dispute.amountMinor, c.dispute.currency);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (action === "PROVIDE_EVIDENCE") await api.approveEvidence(disputeId, c.draft?.id ?? "");
      else await api.approveAccept(disputeId);
      const r = await api.submit(disputeId);
      onDone(r.status);
    } catch (e) {
      setError(`${msg(e)} Nothing else was changed. Review and try again.`);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={action === "PROVIDE_EVIDENCE" ? "Review and approve evidence" : `Accept claim and refund ${amount}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={action === "ACCEPT_CLAIM" || !dry ? "danger" : "primary"} disabled={!ok || !preview.data} busy={busy} onClick={() => void confirm()}>
            {dry ? "Store (dry run)" : "Send to sandbox"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <ModeBanner dataMode={mode} submitMode={c.submitMode} />
        {action === "ACCEPT_CLAIM" ? <p>The buyer receives a full refund of <strong>{amount}</strong> and the dispute closes in their favour.</p> : null}
        <p className="text-[var(--ds-muted)]">This is exactly what {dry ? "would be sent; in dry-run it is stored, not sent" : "will be sent to the PayPal sandbox"}:</p>
        {preview.error ? <ErrorNote>{preview.error.message}</ErrorNote> : preview.data ? <JsonView value={preview.data} /> : <Skeleton rows={4} />}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />I have read this and approve it.
        </label>
      </div>
    </Modal>
  );
}
