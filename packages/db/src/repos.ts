import { createHash } from "node:crypto";
import { type CaseEvent, nextCaseState } from "@ds/core";
import type {
  CaseState,
  ChecklistItem,
  DecisionAid,
  Dispute,
  EvidenceDraft,
  Fact,
  FulfilmentRecord,
  RiskFinding,
  VerifierReport,
} from "@ds/schemas";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import * as t from "./schema.js";

// Repositories: SQL only. Business rules live in @ds/core; the one rule enforced here is that a case
// state is only ever written through the case machine (04 section 3).

export type Actor = "system" | "owner" | "webhook" | "cron" | "cli";

export type CaseRow = typeof t.cases.$inferSelect;
export type DraftRow = typeof t.drafts.$inferSelect;
export type SubmissionRow = typeof t.submissions.$inferSelect;
export type TransactionRow = typeof t.transactions.$inferSelect;
export type RiskFlagRow = typeof t.riskFlags.$inferSelect;
export type FulfilmentRow = typeof t.fulfilmentRecords.$inferSelect;

export type QueueRow = {
  id: string;
  reason: string;
  paypalStatus: string;
  stage: string;
  amountMinor: number;
  currency: string;
  sellerResponseDue: string | null;
  caseState: string;
  caseId: string | null;
  strength: string | null;
  recommendedAction: string | null;
  allowedActions: string[];
  disputedTransactionId: string | null;
  createdAtPaypal: string | null;
  syncedAt: string;
};

const sha256 = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const iso = (d: Date) => d.toISOString();
const omit = <T extends object, K extends keyof T>(o: T, k: K) =>
  Object.fromEntries(Object.entries(o).filter(([key]) => key !== k)) as Omit<
    T,
    K
  >;

export function createRepos(db: Db) {
  const audit = {
    async append(e: {
      actor: Actor;
      action: string;
      caseId?: string | null;
      disputeId?: string | null;
      flagId?: string | null;
      detail?: unknown;
    }) {
      await db.insert(t.auditLog).values({
        actor: e.actor,
        action: e.action,
        caseId: e.caseId ?? null,
        disputeId: e.disputeId ?? null,
        flagId: e.flagId ?? null,
        detail: e.detail ?? null,
      });
    },
    list(f: { caseId?: string; disputeId?: string; limit?: number }) {
      const where = f.caseId
        ? eq(t.auditLog.caseId, f.caseId)
        : f.disputeId
          ? eq(t.auditLog.disputeId, f.disputeId)
          : undefined;
      return db
        .select()
        .from(t.auditLog)
        .where(where)
        .orderBy(desc(t.auditLog.id))
        .limit(f.limit ?? 200);
    },
  };

  const payloads = {
    /** Stores a raw PayPal response once per (source, ref, content) and returns its id. */
    async store(
      source: string,
      ref: string,
      payload: unknown,
      fetchedAt: Date,
    ): Promise<string> {
      const hash = sha256(payload);
      const [row] = await db
        .insert(t.rawPayloads)
        .values({
          source,
          ref,
          payload,
          sha256: hash,
          fetchedAt: iso(fetchedAt),
        })
        .onConflictDoUpdate({
          target: [
            t.rawPayloads.source,
            t.rawPayloads.ref,
            t.rawPayloads.sha256,
          ],
          set: { fetchedAt: iso(fetchedAt) },
        })
        .returning({ id: t.rawPayloads.id });
      if (!row) throw new Error("raw payload insert returned nothing");
      return row.id;
    },
    async get(id: string) {
      const [row] = await db
        .select()
        .from(t.rawPayloads)
        .where(eq(t.rawPayloads.id, id));
      return row ?? null;
    },
    async latest(source: string, ref: string) {
      const [row] = await db
        .select()
        .from(t.rawPayloads)
        .where(
          and(eq(t.rawPayloads.source, source), eq(t.rawPayloads.ref, ref)),
        )
        .orderBy(desc(t.rawPayloads.fetchedAt))
        .limit(1);
      return row ?? null;
    },
  };

  const events = {
    async insert(
      e: Omit<typeof t.paypalEvents.$inferInsert, "receivedAt" | "processedAt">,
    ): Promise<"inserted" | "duplicate"> {
      const rows = await db
        .insert(t.paypalEvents)
        .values(e)
        .onConflictDoNothing()
        .returning({ id: t.paypalEvents.id });
      return rows.length > 0 ? "inserted" : "duplicate";
    },
    async lastReceivedAt(): Promise<Date | null> {
      const [row] = await db
        .select({ at: sql<string | null>`max(${t.paypalEvents.receivedAt})` })
        .from(t.paypalEvents);
      return row?.at ? new Date(row.at) : null;
    },
  };

  const disputes = {
    async upsert(
      d: Dispute,
      payloadId: string | null,
      now: Date,
      outcomeCode: string | null = null,
    ) {
      const values = {
        id: d.id,
        reason: d.reason,
        paypalStatus: d.paypalStatus,
        disputeState: d.disputeState,
        stage: d.stage,
        amountMinor: d.amountMinor,
        currency: d.currency,
        disputedTransactionId: d.disputedTransactionId,
        createdAtPaypal: d.createdAtPaypal,
        updatedAtPaypal: d.updatedAtPaypal,
        sellerResponseDue: d.sellerResponseDue,
        allowedActions: d.allowedActions,
        outcomeCode,
        latestPayloadId: payloadId,
        syncedAt: iso(now),
      };
      const set = omit(values, "id");
      await db
        .insert(t.disputes)
        .values(values)
        .onConflictDoUpdate({ target: t.disputes.id, set });
    },
    async get(id: string) {
      const [row] = await db
        .select()
        .from(t.disputes)
        .where(eq(t.disputes.id, id));
      return row ?? null;
    },
    async queue(f: { caseState?: string; limit: number }): Promise<QueueRow[]> {
      const rows = await db
        .select({
          id: t.disputes.id,
          reason: t.disputes.reason,
          paypalStatus: t.disputes.paypalStatus,
          stage: t.disputes.stage,
          amountMinor: t.disputes.amountMinor,
          currency: t.disputes.currency,
          sellerResponseDue: t.disputes.sellerResponseDue,
          caseState: sql<string>`coalesce(${t.cases.state}, 'NEW')`,
          caseId: t.cases.id,
          strength: t.cases.strength,
          recommendedAction: t.cases.recommendedAction,
          allowedActions: t.disputes.allowedActions,
          disputedTransactionId: t.disputes.disputedTransactionId,
          createdAtPaypal: t.disputes.createdAtPaypal,
          syncedAt: t.disputes.syncedAt,
        })
        .from(t.disputes)
        .leftJoin(t.cases, eq(t.cases.disputeId, t.disputes.id))
        .where(f.caseState ? eq(t.cases.state, f.caseState) : undefined)
        .orderBy(sql`${t.disputes.sellerResponseDue} asc nulls last`)
        .limit(f.limit);
      return rows;
    },
    async lastSyncAt(): Promise<Date | null> {
      const [row] = await db
        .select({ at: sql<string | null>`max(${t.disputes.syncedAt})` })
        .from(t.disputes);
      return row?.at ? new Date(row.at) : null;
    },
  };

  const cases = {
    /** Creates the case for a dispute if it has none (state NEW). */
    async ensure(disputeId: string): Promise<CaseRow> {
      await db
        .insert(t.cases)
        .values({ disputeId, state: "NEW" })
        .onConflictDoNothing();
      const row = await cases.byDispute(disputeId);
      if (!row) throw new Error(`case for ${disputeId} missing after insert`);
      return row;
    },
    async byDispute(disputeId: string) {
      const [row] = await db
        .select()
        .from(t.cases)
        .where(eq(t.cases.disputeId, disputeId));
      return row ?? null;
    },
    async get(id: string) {
      const [row] = await db.select().from(t.cases).where(eq(t.cases.id, id));
      return row ?? null;
    },
    /**
     * Moves a case through the state machine; throws CaseTransitionError on an illegal move. The update is
     * conditional on the state it read, so two writers cannot both apply a transition.
     */
    async transition(
      id: string,
      event: CaseEvent,
      patch: Partial<
        Pick<
          CaseRow,
          | "strength"
          | "checklist"
          | "recommendedAction"
          | "needsInfo"
          | "decision"
          | "errorDetail"
          | "outcomeNote"
        >
      > = {},
    ): Promise<CaseState> {
      const current = await cases.get(id);
      if (!current) throw new Error(`case ${id} not found`);
      const to = nextCaseState(current.state as CaseState, event);
      const closed = to.startsWith("CLOSED_") || to === "EXPIRED";
      const rows = await db
        .update(t.cases)
        .set({
          ...patch,
          state: to,
          updatedAt: sql`now()`,
          ...(closed ? { closedAt: sql`now()` } : {}),
          ...(to !== "ERROR" && patch.errorDetail === undefined
            ? { errorDetail: null }
            : {}),
        })
        .where(and(eq(t.cases.id, id), eq(t.cases.state, current.state)))
        .returning({ id: t.cases.id });
      if (rows.length === 0)
        throw new Error(`case ${id} changed state concurrently`);
      return to;
    },
    async saveAssessment(
      id: string,
      a: {
        strength: string | null;
        checklist: ChecklistItem[];
        recommendedAction: string;
        needsInfo: string[];
        decision: DecisionAid;
      },
    ) {
      await db
        .update(t.cases)
        .set({ ...a, updatedAt: sql`now()` })
        .where(eq(t.cases.id, id));
    },
    listOpenPastDue(now: Date) {
      return db
        .select({ caseId: t.cases.id, disputeId: t.cases.disputeId })
        .from(t.cases)
        .innerJoin(t.disputes, eq(t.disputes.id, t.cases.disputeId))
        .where(
          and(
            inArray(t.cases.state, [
              "NEW",
              "COLLECTING",
              "READY",
              "NEEDS_INFO",
              "APPROVED",
              "ERROR",
            ]),
            sql`${t.disputes.sellerResponseDue} < ${iso(now)}`,
          ),
        );
    },
  };

  const facts = {
    /** Writes one collection snapshot; reads always take the latest snapshot. */
    async replace(caseId: string, list: Fact[], collectedAt: Date) {
      if (list.length === 0) return;
      await db.insert(t.facts).values(
        list.map((f) => ({
          caseId,
          key: f.key,
          label: f.label,
          value: f.value,
          display: f.display,
          sourcePayloadId: f.sourcePayloadId,
          sourcePath: f.jsonPath,
          confidence: f.confidence,
          fetchedAt: f.fetchedAt,
          collectedAt: iso(collectedAt),
        })),
      );
    },
    async latest(caseId: string): Promise<Fact[]> {
      const rows = await db
        .select()
        .from(t.facts)
        .where(
          and(
            eq(t.facts.caseId, caseId),
            sql`${t.facts.collectedAt} = (select max(collected_at) from facts where case_id = ${caseId})`,
          ),
        );
      return rows.map((r) => ({
        key: r.key,
        label: r.label,
        value: r.value as Fact["value"],
        display: r.display,
        sourcePayloadId: r.sourcePayloadId ?? "",
        jsonPath: r.sourcePath ?? "",
        fetchedAt: new Date(r.fetchedAt).toISOString(),
        confidence: r.confidence as Fact["confidence"],
      }));
    },
  };

  const drafts = {
    async create(d: {
      caseId: string;
      origin: string;
      model: string | null;
      promptVersion: string | null;
      content: EvidenceDraft;
      report: VerifierReport;
      passed: boolean;
      metrics?: unknown;
      createdBy: Actor;
    }): Promise<DraftRow> {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${d.caseId}))`,
        );
        const [last] = await tx
          .select({ v: sql<number>`coalesce(max(${t.drafts.version}), 0)` })
          .from(t.drafts)
          .where(eq(t.drafts.caseId, d.caseId));
        const [row] = await tx
          .insert(t.drafts)
          .values({
            caseId: d.caseId,
            version: Number(last?.v ?? 0) + 1,
            origin: d.origin,
            model: d.model,
            promptVersion: d.promptVersion,
            content: d.content,
            notesText: d.report.notesText,
            verifierReport: d.report,
            verifierPassed: d.passed,
            metrics: d.metrics ?? null,
            createdBy: d.createdBy,
          })
          .returning();
        if (!row) throw new Error("draft insert returned nothing");
        return row;
      });
    },
    async latest(caseId: string) {
      const [row] = await db
        .select()
        .from(t.drafts)
        .where(eq(t.drafts.caseId, caseId))
        .orderBy(desc(t.drafts.version))
        .limit(1);
      return row ?? null;
    },
    async get(id: string) {
      const [row] = await db.select().from(t.drafts).where(eq(t.drafts.id, id));
      return row ?? null;
    },
  };

  const submissions = {
    /** Inserts a PENDING submission; the idempotency key is unique, so a replay returns the existing row. */
    async create(
      s: Omit<typeof t.submissions.$inferInsert, "id" | "status">,
    ): Promise<{ row: SubmissionRow; created: boolean }> {
      const rows = await db
        .insert(t.submissions)
        .values({ ...s, status: "PENDING" })
        .onConflictDoNothing()
        .returning();
      if (rows[0]) return { row: rows[0], created: true };
      const [existing] = await db
        .select()
        .from(t.submissions)
        .where(eq(t.submissions.idempotencyKey, s.idempotencyKey));
      if (!existing) throw new Error("submission conflict without a row");
      return { row: existing, created: false };
    },
    async finish(
      id: string,
      status: "SENT" | "DRY_RUN_STORED" | "FAILED",
      response: unknown,
      errorDetail: string | null = null,
    ) {
      await db
        .update(t.submissions)
        .set({
          status,
          responseSnapshot: response ?? null,
          errorDetail,
          sentAt: status === "FAILED" ? null : sql`now()`,
        })
        .where(
          and(eq(t.submissions.id, id), eq(t.submissions.status, "PENDING")),
        );
    },
    byCase(caseId: string) {
      return db
        .select()
        .from(t.submissions)
        .where(eq(t.submissions.caseId, caseId))
        .orderBy(desc(t.submissions.approvedAt));
    },
    byFlag(flagId: string) {
      return db
        .select()
        .from(t.submissions)
        .where(eq(t.submissions.flagId, flagId))
        .orderBy(desc(t.submissions.approvedAt));
    },
  };

  const transactions = {
    async upsert(r: typeof t.transactions.$inferInsert) {
      const set = omit(r, "id");
      await db
        .insert(t.transactions)
        .values(r)
        .onConflictDoUpdate({ target: t.transactions.id, set });
    },
    async get(id: string) {
      const [row] = await db
        .select()
        .from(t.transactions)
        .where(eq(t.transactions.id, id));
      return row ?? null;
    },
    since(at: Date) {
      return db
        .select()
        .from(t.transactions)
        .where(gte(t.transactions.occurredAt, iso(at)))
        .orderBy(desc(t.transactions.occurredAt));
    },
    async setTrackingOnPaypal(id: string) {
      await db
        .update(t.transactions)
        .set({ trackingOnPaypal: true })
        .where(eq(t.transactions.id, id));
    },
  };

  const fulfilment = {
    /** Replaces rows by PayPal transaction id in one transaction (05 section 2.4). Returns replaced ids. */
    async importBatch(
      rows: (Omit<FulfilmentRecord, never> & {
        shipToName?: string | null;
        shipToLine1?: string | null;
        shipToCity?: string | null;
      })[],
      batch: string,
    ) {
      return db.transaction(async (tx) => {
        const ids = rows.map((r) => r.paypalTransactionId);
        const existing = ids.length
          ? await tx
              .select({ id: t.fulfilmentRecords.paypalTransactionId })
              .from(t.fulfilmentRecords)
              .where(inArray(t.fulfilmentRecords.paypalTransactionId, ids))
          : [];
        for (const r of rows) {
          const values = {
            ...r,
            shipToName: r.shipToName ?? null,
            shipToLine1: r.shipToLine1 ?? null,
            shipToCity: r.shipToCity ?? null,
            importBatch: batch,
            importedAt: sql`now()`,
          };
          const set = omit(values, "paypalTransactionId");
          await tx
            .insert(t.fulfilmentRecords)
            .values(values)
            .onConflictDoUpdate({
              target: t.fulfilmentRecords.paypalTransactionId,
              set,
            });
        }
        return existing.map((e) => e.id);
      });
    },
    async byTransaction(id: string) {
      const [row] = await db
        .select()
        .from(t.fulfilmentRecords)
        .where(eq(t.fulfilmentRecords.paypalTransactionId, id));
      return row ?? null;
    },
    list(limit = 500) {
      return db
        .select()
        .from(t.fulfilmentRecords)
        .orderBy(desc(t.fulfilmentRecords.importedAt))
        .limit(limit);
    },
  };

  const risk = {
    /** Upserts open flags for current findings and AUTO_CLEARs open flags whose rule no longer fires. */
    async reconcile(
      transactionId: string,
      findings: RiskFinding[],
    ): Promise<{ opened: number; cleared: number }> {
      return db.transaction(async (tx) => {
        const open = await tx
          .select()
          .from(t.riskFlags)
          .where(
            and(
              eq(t.riskFlags.transactionId, transactionId),
              eq(t.riskFlags.status, "OPEN"),
            ),
          );
        const handled = await tx
          .select({ rule: t.riskFlags.rule })
          .from(t.riskFlags)
          .where(
            and(
              eq(t.riskFlags.transactionId, transactionId),
              inArray(t.riskFlags.status, ["ACTIONED", "DISMISSED"]),
            ),
          );
        let opened = 0;
        let cleared = 0;
        for (const f of findings) {
          const cur = open.find((o) => o.rule === f.rule);
          if (cur) {
            await tx
              .update(t.riskFlags)
              .set({
                reason: f.reason,
                factRefs: f.factRefs,
                severity: f.severity,
                suggestedAction: f.suggestedAction,
              })
              .where(eq(t.riskFlags.id, cur.id));
          } else if (!handled.some((h) => h.rule === f.rule)) {
            await tx.insert(t.riskFlags).values({
              transactionId,
              rule: f.rule,
              severity: f.severity,
              reason: f.reason,
              factRefs: f.factRefs,
              suggestedAction: f.suggestedAction,
              status: "OPEN",
            });
            opened++;
          }
        }
        for (const o of open) {
          if (!findings.some((f) => f.rule === o.rule)) {
            await tx
              .update(t.riskFlags)
              .set({ status: "AUTO_CLEARED", resolvedAt: sql`now()` })
              .where(eq(t.riskFlags.id, o.id));
            cleared++;
          }
        }
        return { opened, cleared };
      });
    },
    list(f: { status?: string; limit?: number } = {}) {
      return db
        .select({ flag: t.riskFlags, txn: t.transactions })
        .from(t.riskFlags)
        .innerJoin(
          t.transactions,
          eq(t.transactions.id, t.riskFlags.transactionId),
        )
        .where(f.status ? eq(t.riskFlags.status, f.status) : undefined)
        .orderBy(desc(t.riskFlags.firstSeenAt))
        .limit(f.limit ?? 500);
    },
    async get(id: string) {
      const [row] = await db
        .select()
        .from(t.riskFlags)
        .where(eq(t.riskFlags.id, id));
      return row ?? null;
    },
    async resolve(id: string, status: "ACTIONED" | "DISMISSED") {
      const rows = await db
        .update(t.riskFlags)
        .set({ status, resolvedAt: sql`now()` })
        .where(and(eq(t.riskFlags.id, id), eq(t.riskFlags.status, "OPEN")))
        .returning({ id: t.riskFlags.id });
      return rows.length > 0;
    },
  };

  const settings = {
    async get<T>(key: string): Promise<T | null> {
      const [row] = await db
        .select()
        .from(t.settings)
        .where(eq(t.settings.key, key));
      return (row?.value as T | undefined) ?? null;
    },
    async set(key: string, value: unknown) {
      await db
        .insert(t.settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: t.settings.key,
          set: { value, updatedAt: sql`now()` },
        });
    },
  };

  const analytics = {
    /** Reads one PII-free view (04 section 2.12a). The view name is from a fixed allow-list. */
    async view(source: AnalyticsSource): Promise<Record<string, unknown>[]> {
      const name = ANALYTICS_VIEWS[source];
      const rows = await db.execute(
        sql.raw(`select * from ${name} limit 5000`),
      );
      return [...rows];
    },
  };

  const health = {
    async ping(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
  };

  return {
    audit,
    payloads,
    events,
    disputes,
    cases,
    facts,
    drafts,
    submissions,
    transactions,
    fulfilment,
    risk,
    settings,
    analytics,
    health,
  };
}

export const ANALYTICS_VIEWS = {
  disputes: "v_analytics_disputes",
  evidence_items: "v_analytics_evidence_items",
  statements: "v_analytics_statements",
  risk_flags: "v_analytics_risk_flags",
} as const;
export type AnalyticsSource = keyof typeof ANALYTICS_VIEWS;

export type Repos = ReturnType<typeof createRepos>;
