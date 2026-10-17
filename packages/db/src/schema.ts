import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Tables from docs/04-data-model.md section 2. No business rules here (rule 3): repos read and write,
// @ds/core decides. Money is minor units + currency. Every table gets RLS with no policy (migration 0001).

const tz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
const minor = (name: string) => bigint(name, { mode: "number" });

export const paypalEvents = pgTable("paypal_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  receivedAt: tz("received_at").notNull().defaultNow(),
  verified: boolean("verified").notNull(),
  verificationDetail: text("verification_detail"),
  headers: jsonb("headers").$type<Record<string, string>>().notNull(),
  bodyRaw: text("body_raw").notNull(),
  processedAt: tz("processed_at"),
});

export const rawPayloads = pgTable(
  "raw_payloads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    ref: text("ref").notNull(),
    fetchedAt: tz("fetched_at").notNull(),
    payload: jsonb("payload").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
  },
  (t) => [
    index("raw_payloads_source_ref_idx").on(
      t.source,
      t.ref,
      t.fetchedAt.desc(),
    ),
    uniqueIndex("raw_payloads_dedupe_idx").on(t.source, t.ref, t.sha256),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    reason: text("reason").notNull(),
    paypalStatus: text("paypal_status").notNull(),
    disputeState: text("dispute_state"),
    stage: text("stage").notNull(),
    amountMinor: minor("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    disputedTransactionId: text("disputed_transaction_id"),
    buyerMasked: text("buyer_masked"),
    createdAtPaypal: tz("created_at_paypal"),
    updatedAtPaypal: tz("updated_at_paypal"),
    sellerResponseDue: tz("seller_response_due"),
    allowedActions: text("allowed_actions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    outcomeCode: text("outcome_code"),
    latestPayloadId: uuid("latest_payload_id").references(() => rawPayloads.id),
    syncedAt: tz("synced_at").notNull(),
  },
  (t) => [
    index("disputes_status_idx").on(t.paypalStatus),
    index("disputes_due_idx").on(t.sellerResponseDue),
    index("disputes_txn_idx").on(t.disputedTransactionId),
  ],
);

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  disputeId: text("dispute_id")
    .notNull()
    .unique()
    .references(() => disputes.id),
  state: text("state").notNull(),
  strength: text("strength"),
  checklist: jsonb("checklist"),
  recommendedAction: text("recommended_action"),
  needsInfo: jsonb("needs_info"),
  decision: jsonb("decision"),
  openedAt: tz("opened_at").notNull().defaultNow(),
  closedAt: tz("closed_at"),
  outcomeNote: text("outcome_note"),
  errorDetail: text("error_detail"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const facts = pgTable(
  "facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: jsonb("value").notNull(),
    display: text("display").notNull(),
    sourcePayloadId: uuid("source_payload_id").references(() => rawPayloads.id),
    sourcePath: text("source_path"),
    confidence: text("confidence").notNull(),
    fetchedAt: tz("fetched_at").notNull(),
    collectedAt: tz("collected_at").notNull(),
  },
  (t) => [
    uniqueIndex("facts_case_key_at_idx").on(t.caseId, t.key, t.collectedAt),
  ],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    version: integer("version").notNull(),
    origin: text("origin").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    content: jsonb("content").notNull(),
    notesText: text("notes_text").notNull(),
    verifierReport: jsonb("verifier_report").notNull(),
    verifierPassed: boolean("verifier_passed").notNull(),
    metrics: jsonb("metrics"),
    createdAt: tz("created_at").notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [uniqueIndex("drafts_case_version_idx").on(t.caseId, t.version)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").references(() => cases.id),
    draftId: uuid("draft_id").references(() => drafts.id),
    flagId: uuid("flag_id"),
    action: text("action").notNull(),
    status: text("status").notNull(),
    requestSnapshot: jsonb("request_snapshot").notNull(),
    responseSnapshot: jsonb("response_snapshot"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: tz("approved_at").notNull(),
    sentAt: tz("sent_at"),
    errorDetail: text("error_detail"),
  },
  (t) => [
    // 04 section 2.7: only ACCEPT_CLAIM and Prevent actions may lack a draft.
    check(
      "submissions_draft_required",
      sql`${t.draftId} IS NOT NULL OR ${t.action} IN ('ACCEPT_CLAIM','ADD_TRACKING','REFUND')`,
    ),
  ],
);

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  orderId: text("order_id"),
  captureId: text("capture_id"),
  invoiceId: text("invoice_id"),
  customField: text("custom_field"),
  occurredAt: tz("occurred_at").notNull(),
  amountMinor: minor("amount_minor").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: text("status"),
  protectionEligibility: text("protection_eligibility"),
  shipToName: text("ship_to_name"),
  shipToLine1: text("ship_to_line1"),
  shipToCity: text("ship_to_city"),
  shipToPostal: text("ship_to_postal"),
  shipToCountry: text("ship_to_country"),
  items: jsonb("items"),
  trackingOnPaypal: boolean("tracking_on_paypal").notNull().default(false),
  payloadId: uuid("payload_id").references(() => rawPayloads.id),
  fetchedAt: tz("fetched_at").notNull(),
});

export const fulfilmentRecords = pgTable("fulfilment_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderRef: text("order_ref").notNull(),
  paypalTransactionId: text("paypal_transaction_id").notNull().unique(),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  shippedAt: tz("shipped_at"),
  deliveredAt: tz("delivered_at"),
  lastScanAt: tz("last_scan_at"),
  shipToName: text("ship_to_name"),
  shipToLine1: text("ship_to_line1"),
  shipToCity: text("ship_to_city"),
  shipToPostal: text("ship_to_postal"),
  shipToCountry: text("ship_to_country"),
  importedAt: tz("imported_at").notNull().defaultNow(),
  importBatch: uuid("import_batch").notNull(),
});

export const riskFlags = pgTable(
  "risk_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    rule: text("rule").notNull(),
    severity: text("severity").notNull(),
    reason: text("reason").notNull(),
    factRefs: jsonb("fact_refs").notNull(),
    status: text("status").notNull(),
    suggestedAction: text("suggested_action"),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    resolvedAt: tz("resolved_at"),
  },
  (t) => [
    uniqueIndex("risk_flags_open_idx")
      .on(t.transactionId, t.rule)
      .where(sql`${t.status} = 'OPEN'`),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: tz("at").notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  caseId: uuid("case_id"),
  disputeId: text("dispute_id"),
  flagId: uuid("flag_id"),
  detail: jsonb("detail"),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    backend: text("backend").notNull().default("postgres"),
    externalRunId: text("external_run_id"),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("QUEUED"),
    runAt: tz("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: tz("locked_at"),
    lastError: text("last_error"),
    createdAt: tz("created_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
  },
  (t) => [
    uniqueIndex("jobs_dedupe_active_idx")
      .on(t.dedupeKey)
      .where(sql`${t.status} IN ('QUEUED','RUNNING')`),
    index("jobs_due_idx").on(t.status, t.runAt),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});
