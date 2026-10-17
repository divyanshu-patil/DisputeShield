import { randomUUID } from "node:crypto";
import { type LlmClient, draftEvidence } from "@ds/agent";
import {
  RUBRIC,
  assessCase,
  blockingMet,
  buildCaseFile,
  type CaseFileInput,
  decide,
  evaluateRisk,
  normaliseDispute,
  paypalEvent,
  toMinor,
  verifierPassed,
  verifyDraft,
} from "@ds/core";
import type { Repos } from "@ds/db";
import type { JobHandlers, JobKind } from "@ds/jobs";
import {
  type PayPalGateway,
  buildAcceptClaim,
  buildAddTracking,
  buildProvideEvidence,
  redact,
} from "@ds/paypal";
import {
  type CaseState,
  DEFAULT_RISK_THRESHOLDS,
  type EvidenceDraft,
  type Fact,
  type FulfilmentRecord,
  type PaypalOrder,
  type PaypalTransactionDetail,
  type RiskThresholds,
} from "@ds/schemas";
import { parseFulfilmentCsv } from "./csv.js";

// Application services and job handlers shared by apps/api (Postgres worker) and apps/workflows (Render
// tasks). Rules come from @ds/core, I/O from @ds/db, @ds/paypal and @ds/agent; this file only sequences.

export class ServiceError extends Error {
  override name = "ServiceError";
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "UPSTREAM",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type PipelineDeps = {
  repos: Repos;
  gateway: PayPalGateway;
  llm: LlmClient | null;
  model: string | null;
  submitMode: "dry-run" | "live";
  clock: () => Date;
  enqueue: (job: {
    kind: JobKind;
    payload: Record<string, unknown>;
    dedupeKey?: string;
  }) => Promise<void>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
};

const DAY = 86_400_000;
const OPEN: CaseState[] = [
  "NEW",
  "COLLECTING",
  "READY",
  "NEEDS_INFO",
  "APPROVED",
  "ERROR",
];

/** Postgres text timestamps ("2026-10-07 00:00:00+00") to ISO. */
export const isoOf = (s: string | null | undefined): string | null =>
  s
    ? new Date(
        s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"),
      ).toISOString()
    : null;

const fulfilmentRecord = (
  r: NonNullable<Awaited<ReturnType<Repos["fulfilment"]["byTransaction"]>>>,
): FulfilmentRecord => ({
  orderRef: r.orderRef,
  paypalTransactionId: r.paypalTransactionId,
  carrier: r.carrier,
  trackingNumber: r.trackingNumber,
  shippedAt: isoOf(r.shippedAt),
  deliveredAt: isoOf(r.deliveredAt),
  lastScanAt: isoOf(r.lastScanAt),
  shipToPostal: r.shipToPostal,
  shipToCountry: r.shipToCountry,
});

const orderIdOf = (t: PaypalTransactionDetail) =>
  t.transaction_info.paypal_reference_id_type === "ODR"
    ? (t.transaction_info.paypal_reference_id ?? null)
    : null;

export function createPipeline(d: PipelineDeps) {
  const { repos, gateway, clock } = d;
  const log = d.log ?? (() => {});
  // ponytail: per-process lock; a second API instance would need a row lock on submissions.
  const sending = new Set<string>();

  async function upsertTransaction(
    t: PaypalTransactionDetail,
    order: PaypalOrder | null,
    payloadId: string,
    fetchedAt: Date,
  ) {
    const info = t.transaction_info;
    const existing = await repos.transactions.get(info.transaction_id);
    const pu = order?.purchase_units[0];
    const addr = t.shipping_info?.address as
      Record<string, string | undefined> | undefined;
    await repos.transactions.upsert({
      id: info.transaction_id,
      orderId: orderIdOf(t),
      captureId: pu?.payments?.captures?.[0]?.id ?? existing?.captureId ?? null,
      invoiceId: info.invoice_id ?? null,
      customField: info.custom_field ?? null,
      occurredAt: info.transaction_initiation_date,
      amountMinor: toMinor(
        info.transaction_amount.value,
        info.transaction_amount.currency_code,
      ),
      currency: info.transaction_amount.currency_code,
      status: info.transaction_status,
      protectionEligibility: info.protection_eligibility ?? null,
      shipToName: t.shipping_info?.name ?? null,
      shipToLine1: addr?.["line1"] ?? null,
      shipToCity: addr?.["city"] ?? null,
      shipToPostal: addr?.["postal_code"] ?? null,
      shipToCountry: addr?.["country_code"] ?? null,
      items: t.cart_info?.item_details ?? null,
      trackingOnPaypal:
        (pu?.shipping?.trackers?.length ?? 0) > 0 ||
        (existing?.trackingOnPaypal ?? false),
      payloadId,
      fetchedAt: fetchedAt.toISOString(),
    });
  }

  async function getOrderSafe(id: string | null) {
    if (!id) return null;
    try {
      return await gateway.getOrder(id);
    } catch (err) {
      log("order fetch failed", { orderId: id, error: String(err) });
      return null;
    }
  }

  // ---- jobs ----

  /** `queueCollect: false` when the caller collects inline (the demo seed), so the worker does not redo it. */
  async function syncDispute(
    disputeId: string,
    queueCollect = true,
  ): Promise<{ caseId: string | null }> {
    const now = clock();
    const res = await gateway.getDispute(disputeId);
    const pid = await repos.payloads.store("dispute", disputeId, res.body, now);
    const norm = normaliseDispute(res.body);
    await repos.disputes.upsert(
      norm,
      pid,
      now,
      res.body.dispute_outcome?.outcome_code ?? null,
    );
    let kase = await repos.cases.byDispute(disputeId);
    const needsSeller =
      norm.allowedActions.length > 0 ||
      norm.paypalStatus === "WAITING_FOR_SELLER_RESPONSE";
    if (!kase && needsSeller) {
      kase = await repos.cases.ensure(disputeId);
      await repos.audit.append({
        actor: "system",
        action: "CASE_OPENED",
        caseId: kase.id,
        disputeId,
      });
      if (queueCollect)
        await d.enqueue({
          kind: "collect_case",
          payload: { disputeId },
          dedupeKey: `collect_case:${disputeId}`,
        });
    }
    if (!kase) return { caseId: null };
    const subs = await repos.submissions.byCase(kase.id);
    const accepted = subs.some(
      (s) =>
        s.action === "ACCEPT_CLAIM" &&
        (s.status === "SENT" || s.status === "DRY_RUN_STORED"),
    );
    const ev = paypalEvent(
      kase.state as CaseState,
      norm.paypalStatus,
      res.body.dispute_outcome?.outcome_code,
      accepted,
    );
    if (ev) {
      const to = await repos.cases.transition(kase.id, ev, {
        outcomeNote: res.body.dispute_outcome?.outcome_code ?? null,
      });
      await repos.audit.append({
        actor: "system",
        action: "CASE_STATE",
        caseId: kase.id,
        disputeId,
        detail: { event: ev, to },
      });
    } else if (
      OPEN.includes(kase.state as CaseState) &&
      norm.sellerResponseDue &&
      Date.parse(norm.sellerResponseDue) < now.getTime()
    ) {
      await repos.cases.transition(kase.id, "DEADLINE_PASSED");
      await repos.audit.append({
        actor: "system",
        action: "CASE_EXPIRED",
        caseId: kase.id,
        disputeId,
      });
    }
    return { caseId: kase.id };
  }

  async function syncDisputes(
    queueCollect = true,
  ): Promise<{ synced: number }> {
    const started = clock();
    const cursor = await repos.settings.get<string>("sync.last_dispute_cursor");
    const after = cursor
      ? new Date(Date.parse(cursor) - 10 * 60_000).toISOString()
      : undefined;
    const ids = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await gateway.listDisputes({
        ...(after ? { updateTimeAfter: after } : {}),
        ...(token ? { nextPageToken: token } : {}),
      });
      for (const item of res.body.items) ids.add(item.dispute_id);
      const next = res.body.links?.find((l) => l.rel === "next")?.href;
      token = next
        ? (new URL(next, "https://x").searchParams.get("next_page_token") ??
          undefined)
        : undefined;
      if (!token) break;
    }
    for (const id of ids) await syncDispute(id, queueCollect);
    for (const c of await repos.cases.listOpenPastDue(started)) {
      await repos.cases.transition(c.caseId, "DEADLINE_PASSED");
      await repos.audit.append({
        actor: "system",
        action: "CASE_EXPIRED",
        caseId: c.caseId,
        disputeId: c.disputeId,
      });
    }
    await repos.settings.set("sync.last_dispute_cursor", started.toISOString());
    return { synced: ids.size };
  }

  /** `queueDraft: false` when the caller drafts inline (the demo seed). */
  async function collectCase(
    disputeId: string,
    queueDraft = true,
  ): Promise<{ caseId: string; state: string }> {
    const kase = await repos.cases.ensure(disputeId);
    await repos.cases.transition(kase.id, "COLLECT");
    try {
      const now = clock();
      const dres = await gateway.getDispute(disputeId);
      const dPid = await repos.payloads.store(
        "dispute",
        disputeId,
        dres.body,
        now,
      );
      const norm = normaliseDispute(dres.body);
      await repos.disputes.upsert(
        norm,
        dPid,
        now,
        dres.body.dispute_outcome?.outcome_code ?? null,
      );
      const input: CaseFileInput = {
        dispute: {
          body: dres.body,
          payloadId: dPid,
          fetchedAt: dres.recordedAt,
        },
      };
      const txnId = norm.disputedTransactionId;
      if (txnId) {
        const paidAt = Date.parse(
          dres.body.disputed_transactions[0]?.create_time ??
            norm.createdAtPaypal ??
            now.toISOString(),
        );
        const search = await gateway.searchTransactions({
          startDate: new Date(
            Math.max(paidAt - 2 * DAY, now.getTime() - 90 * DAY),
          ).toISOString(),
          endDate: now.toISOString(),
          transactionId: txnId,
        });
        const rows = search.body.transaction_details.filter(
          (t) => t.transaction_info.transaction_id === txnId,
        );
        const row =
          rows.find(
            (t) => t.transaction_info.transaction_event_code === "T0000",
          ) ?? rows[0];
        if (row) {
          const tPid = await repos.payloads.store(
            "transaction",
            txnId,
            row,
            now,
          );
          input.transaction = {
            body: row,
            payloadId: tPid,
            fetchedAt: search.recordedAt,
          };
          const ores = await getOrderSafe(orderIdOf(row));
          if (ores) {
            const oPid = await repos.payloads.store(
              "order",
              ores.body.id,
              ores.body,
              now,
            );
            input.order = {
              body: ores.body,
              payloadId: oPid,
              fetchedAt: ores.recordedAt,
            };
            const capture =
              ores.body.purchase_units[0]?.payments?.captures?.[0]?.id;
            input.trackers = (
              ores.body.purchase_units[0]?.shipping?.trackers ?? []
            ).map((t, i) => ({
              body: {
                id: t.id,
                ...(capture ? { transaction_id: capture } : {}),
              },
              payloadId: oPid,
              fetchedAt: ores.recordedAt,
              path: `purchase_units[0].shipping.trackers[${i}]`,
            }));
          }
          await upsertTransaction(row, ores?.body ?? null, tPid, now);
        }
        const f = await repos.fulfilment.byTransaction(txnId);
        if (f) {
          const rec = fulfilmentRecord(f);
          const fPid = await repos.payloads.store(
            "fulfilment.csv",
            txnId,
            rec,
            now,
          );
          input.fulfilment = {
            body: rec,
            payloadId: fPid,
            fetchedAt: isoOf(f.importedAt) ?? now.toISOString(),
          };
        }
      }
      const facts = buildCaseFile(input);
      await repos.facts.replace(kase.id, facts, now);
      const a = assessCase(norm.reason, facts);
      const refund = facts.find((x) => x.key === "refund.amount");
      const decision = decide({
        kind: a.kind,
        strength: a.strength,
        checklist: a.checklist,
        amount: { currency: norm.currency, minor: norm.amountMinor },
        dueAt: norm.sellerResponseDue,
        allowedActions: norm.allowedActions,
        refundedMinor:
          refund && refund.display.startsWith(norm.currency)
            ? Number(refund.value)
            : 0,
        caseState: "COLLECTING",
        now,
      });
      await repos.cases.saveAssessment(kase.id, {
        strength: a.strength,
        checklist: a.checklist,
        recommendedAction: a.recommendedAction,
        needsInfo: a.needsInfo,
        decision,
      });
      const ready = blockingMet(a.checklist);
      const state = await repos.cases.transition(
        kase.id,
        ready ? "COLLECTED_READY" : "COLLECTED_NEEDS_INFO",
      );
      await repos.audit.append({
        actor: "system",
        action: "FACTS_COLLECTED",
        caseId: kase.id,
        disputeId,
        detail: { facts: facts.length, state, strength: a.strength },
      });
      if (queueDraft && ready && a.kind !== "GENERIC") {
        await d.enqueue({
          kind: "draft_case",
          payload: { caseId: kase.id },
          dedupeKey: `draft_case:${kase.id}`,
        });
      }
      return { caseId: kase.id, state };
    } catch (err) {
      const detail = (
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      ).slice(0, 500);
      await repos.cases
        .transition(kase.id, "FAIL", { errorDetail: detail })
        .catch(() => undefined);
      throw err;
    }
  }

  async function caseContext(caseId: string) {
    const kase = await repos.cases.get(caseId);
    if (!kase) throw new ServiceError("NOT_FOUND", `case ${caseId} not found`);
    const dispute = await repos.disputes.get(kase.disputeId);
    if (!dispute)
      throw new ServiceError(
        "NOT_FOUND",
        `dispute ${kase.disputeId} not found`,
      );
    const facts = await repos.facts.latest(caseId);
    return {
      kase,
      dispute,
      facts,
      assessment: assessCase(dispute.reason, facts),
    };
  }

  async function draftCase(
    caseId: string,
  ): Promise<{ draftId: string; verifierPassed: boolean }> {
    const { kase, dispute, facts, assessment } = await caseContext(caseId);
    if (assessment.kind === "GENERIC" || !blockingMet(assessment.checklist))
      return { draftId: "", verifierPassed: false };
    const r = await draftEvidence({
      llm: d.llm,
      model: d.model,
      reason: dispute.reason,
      assessment,
      facts,
    });
    const row = await repos.drafts.create({
      caseId,
      origin: r.origin,
      model: r.model,
      promptVersion: r.promptVersion,
      content: r.draft,
      report: r.report,
      passed: r.passed,
      metrics: r.metrics,
      createdBy: "system",
    });
    await repos.audit.append({
      actor: "system",
      action: r.passed ? "DRAFT_CREATED" : "VERIFIER_FAILED",
      caseId,
      disputeId: kase.disputeId,
      detail: {
        version: row.version,
        origin: r.origin,
        accepted: r.report.accepted.length,
        rejected: r.report.rejected.length,
      },
    });
    log("draft created", {
      caseId,
      origin: r.origin,
      latencyMs: r.metrics.latencyMs,
    });
    return { draftId: row.id, verifierPassed: r.passed };
  }

  async function thresholds(): Promise<RiskThresholds> {
    return {
      ...DEFAULT_RISK_THRESHOLDS,
      ...((await repos.settings.get<Partial<RiskThresholds>>(
        "risk.thresholds",
      )) ?? {}),
    };
  }

  async function evaluateOne(
    txnId: string,
  ): Promise<{ opened: number; cleared: number }> {
    const t = await repos.transactions.get(txnId);
    if (!t) return { opened: 0, cleared: 0 };
    const f = await repos.fulfilment.byTransaction(txnId);
    const findings = evaluateRisk(
      {
        id: t.id,
        occurredAt: isoOf(t.occurredAt) ?? t.occurredAt,
        amountMinor: t.amountMinor,
        currency: t.currency,
        protectionEligibility: t.protectionEligibility,
        shipToPostal: t.shipToPostal,
        shipToCountry: t.shipToCountry,
        trackingOnPaypal: t.trackingOnPaypal,
      },
      f ? fulfilmentRecord(f) : null,
      clock(),
      await thresholds(),
    );
    return repos.risk.reconcile(txnId, findings);
  }

  async function scanTransactions(
    sinceDays: number,
  ): Promise<{ flagged: number }> {
    const now = clock();
    const res = await gateway.searchTransactions({
      startDate: new Date(now.getTime() - sinceDays * DAY).toISOString(),
      endDate: now.toISOString(),
    });
    let flagged = 0;
    for (const row of res.body.transaction_details.filter(
      (t) => t.transaction_info.transaction_event_code === "T0000",
    )) {
      const pid = await repos.payloads.store(
        "transaction",
        row.transaction_info.transaction_id,
        row,
        now,
      );
      const order = await getOrderSafe(orderIdOf(row));
      await upsertTransaction(row, order?.body ?? null, pid, now);
      flagged += (await evaluateOne(row.transaction_info.transaction_id))
        .opened;
    }
    await repos.settings.set("risk.last_scan_at", now.toISOString());
    return { flagged };
  }

  const handlers: JobHandlers = {
    sync_disputes: () => syncDisputes(),
    sync_dispute: (p) => syncDispute(p.disputeId),
    collect_case: (p) => collectCase(p.disputeId),
    draft_case: (p) => draftCase(p.caseId),
    scan_transactions: (p) => scanTransactions(p.sinceDays),
  };

  // ---- services for routes ----

  async function caseByDispute(disputeId: string) {
    const kase = await repos.cases.byDispute(disputeId);
    if (!kase)
      throw new ServiceError("NOT_FOUND", `no case for dispute ${disputeId}`);
    return caseContext(kase.id);
  }

  async function caseFile(disputeId: string) {
    const dispute = await repos.disputes.get(disputeId);
    if (!dispute)
      throw new ServiceError("NOT_FOUND", `dispute ${disputeId} not found`);
    const kase = await repos.cases.byDispute(disputeId);
    const facts = kase ? await repos.facts.latest(kase.id) : [];
    const assessment = assessCase(dispute.reason, facts);
    const draft = kase ? await repos.drafts.latest(kase.id) : null;
    const submissions = kase ? await repos.submissions.byCase(kase.id) : [];
    const refund = facts.find((x) => x.key === "refund.amount");
    const decision = decide({
      kind: assessment.kind,
      strength: assessment.strength,
      checklist: assessment.checklist,
      amount: { currency: dispute.currency, minor: dispute.amountMinor },
      dueAt: isoOf(dispute.sellerResponseDue),
      allowedActions: dispute.allowedActions,
      refundedMinor:
        refund && refund.display.startsWith(dispute.currency)
          ? Number(refund.value)
          : 0,
      caseState: kase?.state ?? "NEW",
      now: clock(),
    });
    return {
      dispute: {
        ...dispute,
        sellerResponseDue: isoOf(dispute.sellerResponseDue),
        createdAtPaypal: isoOf(dispute.createdAtPaypal),
        syncedAt: isoOf(dispute.syncedAt),
      },
      case: kase
        ? {
            id: kase.id,
            state: kase.state,
            errorDetail: kase.errorDetail,
            updatedAt: isoOf(kase.updatedAt),
          }
        : null,
      kind: assessment.kind,
      facts,
      checklist: assessment.checklist,
      strength: assessment.strength,
      needsInfo: assessment.needsInfo,
      evidenceType: assessment.evidenceType,
      decision,
      rubric: RUBRIC,
      draft: draft && {
        id: draft.id,
        version: draft.version,
        origin: draft.origin,
        model: draft.model,
        promptVersion: draft.promptVersion,
        content: draft.content as EvidenceDraft,
        report: draft.verifierReport,
        passed: draft.verifierPassed,
        createdAt: isoOf(draft.createdAt),
      },
      submissions: submissions.map((s) => ({
        id: s.id,
        action: s.action,
        status: s.status,
        requestSnapshot: s.requestSnapshot,
        responseSnapshot: s.responseSnapshot,
        approvedAt: isoOf(s.approvedAt),
        sentAt: isoOf(s.sentAt),
        errorDetail: s.errorDetail,
        idempotencyKey: s.idempotencyKey,
      })),
      submitMode: d.submitMode,
    };
  }

  async function payload(id: string) {
    const p = await repos.payloads.get(id);
    if (!p) throw new ServiceError("NOT_FOUND", "payload not found");
    return {
      id: p.id,
      source: p.source,
      ref: p.ref,
      fetchedAt: isoOf(p.fetchedAt),
      payload: redact(p.payload),
    };
  }

  async function verifyEdit(disputeId: string, draft: EvidenceDraft) {
    const { kase, facts, assessment } = await caseByDispute(disputeId);
    const report = verifyDraft(draft, facts);
    const passed = verifierPassed(report, assessment.checklist);
    // 06 section 4: a failing edit is reported, not stored, so the previous passing version stays approvable.
    if (!passed) {
      await repos.audit.append({
        actor: "owner",
        action: "VERIFIER_FAILED",
        caseId: kase.id,
        disputeId,
        detail: { rejected: report.rejected.length },
      });
      return { draftId: null, version: null, report, passed };
    }
    const row = await repos.drafts.create({
      caseId: kase.id,
      origin: "HUMAN_EDIT",
      model: null,
      promptVersion: null,
      content: draft,
      report,
      passed,
      createdBy: "owner",
    });
    await repos.audit.append({
      actor: "owner",
      action: "DRAFT_EDITED",
      caseId: kase.id,
      disputeId,
      detail: { version: row.version, rejected: report.rejected.length },
    });
    return { draftId: row.id, version: row.version, report, passed };
  }

  /** The exact request an approval would store and send (06 section 4: "Say what will happen"). */
  async function buildSnapshot(
    disputeId: string,
    input:
      | { action: "PROVIDE_EVIDENCE"; draftId?: string }
      | { action: "ACCEPT_CLAIM"; comment?: string },
  ) {
    const { kase, dispute, facts } = await caseByDispute(disputeId);
    const due = isoOf(dispute.sellerResponseDue);
    if (due && Date.parse(due) <= clock().getTime())
      throw new ServiceError("CONFLICT", "The response deadline has passed.");
    if (input.action === "ACCEPT_CLAIM") {
      if (!dispute.allowedActions.includes("accept_claim"))
        throw new ServiceError(
          "CONFLICT",
          "PayPal offers no accept_claim link for this dispute (LinkMissing).",
        );
      return {
        kase,
        draftId: null,
        snapshot: {
          method: "POST",
          path: `/v1/customer/disputes/${disputeId}/accept-claim`,
          contentType: "application/json",
          input: buildAcceptClaim(input.comment),
        },
      };
    }
    if (!dispute.allowedActions.includes("provide_evidence"))
      throw new ServiceError(
        "CONFLICT",
        "PayPal offers no provide_evidence link for this dispute (LinkMissing).",
      );
    if (kase.state !== "READY")
      throw new ServiceError("CONFLICT", `Case is ${kase.state}, not READY.`);
    const latest = await repos.drafts.latest(kase.id);
    if (!latest || (input.draftId && latest.id !== input.draftId))
      throw new ServiceError(
        "CONFLICT",
        "Only the latest draft version can be approved.",
      );
    if (!latest.verifierPassed)
      throw new ServiceError(
        "CONFLICT",
        "The verifier has not passed this draft.",
      );
    const type = (latest.content as EvidenceDraft).evidenceType;
    if (type !== "PROOF_OF_FULFILLMENT" && type !== "PROOF_OF_REFUND")
      throw new ServiceError(
        "CONFLICT",
        `Evidence type ${type} cannot be sent from Dispute Shield.`,
      );
    return {
      kase,
      draftId: latest.id,
      snapshot: {
        method: "POST",
        path: `/v1/customer/disputes/${disputeId}/provide-evidence`,
        contentType: "multipart/form-data",
        input: buildProvideEvidence(type, facts, latest.notesText),
      },
    };
  }

  async function approve(
    disputeId: string,
    input:
      | { action: "PROVIDE_EVIDENCE"; draftId: string }
      | { action: "ACCEPT_CLAIM"; comment?: string },
  ) {
    const { kase, draftId, snapshot } = await buildSnapshot(disputeId, input);
    await repos.cases
      .transition(
        kase.id,
        input.action === "ACCEPT_CLAIM" ? "APPROVE_ACCEPT" : "APPROVE",
      )
      .catch((err: unknown) => {
        throw new ServiceError(
          "CONFLICT",
          err instanceof Error ? err.message : "case cannot be approved",
        );
      });
    const { row } = await repos.submissions.create({
      caseId: kase.id,
      draftId,
      action: input.action,
      requestSnapshot: snapshot,
      idempotencyKey: `${input.action}:${kase.id}:${randomUUID()}`,
      approvedBy: "owner",
      approvedAt: clock().toISOString(),
    });
    await repos.audit.append({
      actor: "owner",
      action: "APPROVED",
      caseId: kase.id,
      disputeId,
      detail: { action: input.action, submissionId: row.id },
    });
    return { submissionId: row.id };
  }

  async function submit(disputeId: string) {
    const { kase } = await caseByDispute(disputeId);
    if (kase.state !== "APPROVED")
      throw new ServiceError(
        "CONFLICT",
        `Case is ${kase.state}; approve it first.`,
      );
    if (sending.has(kase.id))
      throw new ServiceError(
        "CONFLICT",
        "A submission for this case is already being sent.",
      );
    sending.add(kase.id);
    try {
      const subs = await repos.submissions.byCase(kase.id);
      let sub = subs.find((s) => s.status === "PENDING");
      if (!sub) {
        const failed = subs.find((s) => s.status === "FAILED");
        if (!failed)
          throw new ServiceError("CONFLICT", "Nothing is waiting to be sent.");
        // Retry: a new row with a new idempotency key, same request (04 section 4).
        sub = (
          await repos.submissions.create({
            caseId: kase.id,
            draftId: failed.draftId,
            action: failed.action,
            requestSnapshot: failed.requestSnapshot,
            idempotencyKey: `${failed.action}:${kase.id}:${randomUUID()}`,
            approvedBy: "owner",
            approvedAt: clock().toISOString(),
          })
        ).row;
      }
      const snap = sub.requestSnapshot as { input: unknown };
      if (d.submitMode === "dry-run") {
        await repos.submissions.finish(sub.id, "DRY_RUN_STORED", {
          dryRun: true,
        });
        await repos.cases.transition(kase.id, "SUBMITTED");
        await repos.audit.append({
          actor: "owner",
          action: "DRY_RUN_STORED",
          caseId: kase.id,
          disputeId,
          detail: { submissionId: sub.id, action: sub.action },
        });
        return { submissionId: sub.id, status: "DRY_RUN_STORED" as const };
      }
      try {
        const res =
          sub.action === "ACCEPT_CLAIM"
            ? await gateway.acceptClaim(
                disputeId,
                snap.input as Parameters<PayPalGateway["acceptClaim"]>[1],
              )
            : await gateway.provideEvidence(
                disputeId,
                snap.input as Parameters<PayPalGateway["provideEvidence"]>[1],
              );
        await repos.submissions.finish(sub.id, "SENT", {
          status: res.status,
          body: res.body,
          debugId: res.debugId ?? null,
        });
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(
          0,
          500,
        );
        await repos.submissions.finish(sub.id, "FAILED", null, msg);
        await repos.audit.append({
          actor: "owner",
          action: "SUBMIT_FAILED",
          caseId: kase.id,
          disputeId,
          detail: { submissionId: sub.id, error: msg },
        });
        throw new ServiceError(
          "UPSTREAM",
          `PayPal refused the submission: ${msg}`,
        );
      }
      await repos.cases.transition(kase.id, "SUBMITTED");
      await repos.audit.append({
        actor: "owner",
        action: "SUBMITTED",
        caseId: kase.id,
        disputeId,
        detail: { submissionId: sub.id, action: sub.action },
      });
      await d.enqueue({
        kind: "sync_dispute",
        payload: { disputeId },
        dedupeKey: `sync_dispute:${disputeId}`,
      });
      return { submissionId: sub.id, status: "SENT" as const };
    } finally {
      sending.delete(kase.id);
    }
  }

  async function recollect(disputeId: string) {
    const kase = await repos.cases.byDispute(disputeId);
    if (!kase)
      throw new ServiceError("NOT_FOUND", `no case for dispute ${disputeId}`);
    if (!["NEW", "NEEDS_INFO", "READY", "ERROR"].includes(kase.state))
      throw new ServiceError(
        "CONFLICT",
        `Case is ${kase.state}; it cannot be re-collected.`,
      );
    await d.enqueue({
      kind: "collect_case",
      payload: { disputeId },
      dedupeKey: `collect_case:${disputeId}`,
    });
  }

  async function regenerate(disputeId: string) {
    const kase = await repos.cases.byDispute(disputeId);
    if (!kase)
      throw new ServiceError("NOT_FOUND", `no case for dispute ${disputeId}`);
    if (kase.state !== "READY")
      throw new ServiceError(
        "CONFLICT",
        `Case is ${kase.state}; drafts are made for READY cases.`,
      );
    await d.enqueue({
      kind: "draft_case",
      payload: { caseId: kase.id },
      dedupeKey: `draft_case:${kase.id}`,
    });
  }

  async function importFulfilment(csv: string) {
    const { rows, errors } = parseFulfilmentCsv(csv);
    if (errors.length > 0)
      throw new ServiceError(
        "VALIDATION_ERROR",
        `The file has ${errors.length} problem(s); nothing was imported.`,
        errors,
      );
    if (rows.length === 0)
      throw new ServiceError("VALIDATION_ERROR", "The file has no rows.");
    const batch = randomUUID();
    const replaced = await repos.fulfilment.importBatch(
      rows.map((r) => ({
        orderRef: r.order_ref,
        paypalTransactionId: r.paypal_transaction_id,
        carrier: r.carrier ?? null,
        trackingNumber: r.tracking_number ?? null,
        shippedAt: r.shipped_at ?? null,
        deliveredAt: r.delivered_at ?? null,
        lastScanAt: r.last_scan_at ?? null,
        shipToName: r.ship_to_name ?? null,
        shipToLine1: r.ship_to_line1 ?? null,
        shipToCity: r.ship_to_city ?? null,
        shipToPostal: r.ship_to_postal ?? null,
        shipToCountry: r.ship_to_country ?? null,
      })),
      batch,
    );
    for (const r of rows) await evaluateOne(r.paypal_transaction_id);
    await repos.audit.append({
      actor: "owner",
      action: "CSV_IMPORTED",
      detail: { batch, rows: rows.length, replaced: replaced.length },
    });
    return { imported: rows.length, replaced: replaced.length, batch };
  }

  async function flagAction(
    flagId: string,
    input:
      | { action: "DISMISS" }
      | { action: "ADD_TRACKING"; trackingNumber: string; carrier: string }
      | { action: "REFUND" },
  ) {
    const flag = await repos.risk.get(flagId);
    if (!flag) throw new ServiceError("NOT_FOUND", "flag not found");
    if (flag.status !== "OPEN")
      throw new ServiceError("CONFLICT", `Flag is ${flag.status}.`);
    if (input.action === "DISMISS") {
      await repos.risk.resolve(flagId, "DISMISSED");
      await repos.audit.append({
        actor: "owner",
        action: "FLAG_DISMISSED",
        flagId,
      });
      return { status: "DISMISSED" };
    }
    const t = await repos.transactions.get(flag.transactionId);
    if (!t?.captureId || !t.orderId)
      throw new ServiceError(
        "CONFLICT",
        "This payment has no PayPal order and capture, so PayPal cannot be updated from here.",
      );
    const body =
      input.action === "ADD_TRACKING"
        ? buildAddTracking(t.captureId, input.trackingNumber, input.carrier)
        : { note_to_payer: "Refund from Hearthside Ceramics." };
    const path =
      input.action === "ADD_TRACKING"
        ? `/v2/checkout/orders/${t.orderId}/track`
        : `/v2/payments/captures/${t.captureId}/refund`;
    const key = `${input.action}:${flagId}`;
    const { row, created } = await repos.submissions.create({
      flagId,
      action: input.action,
      requestSnapshot: { method: "POST", path, input: body },
      idempotencyKey: key,
      approvedBy: "owner",
      approvedAt: clock().toISOString(),
    });
    if (!created && row.status !== "PENDING") return { status: row.status };
    if (d.submitMode === "dry-run") {
      await repos.submissions.finish(row.id, "DRY_RUN_STORED", {
        dryRun: true,
      });
    } else {
      try {
        const res =
          input.action === "ADD_TRACKING"
            ? await gateway.addTracking(
                t.orderId,
                body as Parameters<PayPalGateway["addTracking"]>[1],
                { requestId: key },
              )
            : await gateway.refundCapture(
                t.captureId,
                body as { note_to_payer: string },
                {
                  requestId: key,
                },
              );
        await repos.submissions.finish(row.id, "SENT", {
          status: res.status,
          body: res.body,
        });
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(
          0,
          500,
        );
        await repos.submissions.finish(row.id, "FAILED", null, msg);
        throw new ServiceError(
          "UPSTREAM",
          `PayPal refused the request: ${msg}`,
        );
      }
    }
    if (input.action === "ADD_TRACKING")
      await repos.transactions.setTrackingOnPaypal(t.id);
    await repos.risk.resolve(flagId, "ACTIONED");
    await repos.audit.append({
      actor: "owner",
      action: "FLAG_ACTIONED",
      flagId,
      detail: { action: input.action, mode: d.submitMode },
    });
    return { status: d.submitMode === "dry-run" ? "DRY_RUN_STORED" : "SENT" };
  }

  async function listFlags(status?: string) {
    const rows = await repos.risk.list(status ? { status } : {});
    return rows.map(({ flag, txn }) => ({
      id: flag.id,
      rule: flag.rule,
      severity: flag.severity,
      reason: flag.reason,
      status: flag.status,
      suggestedAction: flag.suggestedAction,
      firstSeenAt: isoOf(flag.firstSeenAt),
      transactionId: txn.id,
      amountMinor: txn.amountMinor,
      currency: txn.currency,
      occurredAt: isoOf(txn.occurredAt),
      trackingOnPaypal: txn.trackingOnPaypal,
      canUpdatePaypal: !!txn.captureId && !!txn.orderId,
    }));
  }

  return {
    handlers,
    syncDispute,
    syncDisputes,
    collectCase,
    draftCase,
    scanTransactions,
    caseFile,
    payload,
    async preview(
      disputeId: string,
      input: Parameters<typeof buildSnapshot>[1],
    ) {
      return (await buildSnapshot(disputeId, input)).snapshot;
    },
    verifyEdit,
    approve,
    submit,
    recollect,
    regenerate,
    importFulfilment,
    flagAction,
    listFlags,
    thresholds,
    async setThresholds(t: RiskThresholds) {
      await repos.settings.set("risk.thresholds", t);
      await repos.audit.append({
        actor: "owner",
        action: "SETTINGS_CHANGED",
        detail: { key: "risk.thresholds" },
      });
    },
  };
}

export type Pipeline = ReturnType<typeof createPipeline>;
export type CaseFile = Awaited<ReturnType<Pipeline["caseFile"]>>;
export type { Fact };
