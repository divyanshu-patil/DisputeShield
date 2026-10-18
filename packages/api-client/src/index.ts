// Typed client for apps/api, used by apps/web through the same-origin /api rewrite (ADR-015).
// Shapes mirror the API responses; the OpenAPI document at /api/openapi.json is the reference.

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type Health = {
  status: "ok" | "degraded";
  mode: "live" | "replay";
  submitMode: "dry-run" | "live";
  paypalEnv: "sandbox";
  database: "ok" | "down" | "not_configured";
  llm: "ok" | "down" | "not_configured";
  lastSyncAt: string | null;
  lastWebhookAt: string | null;
  jobBackend: "postgres" | "render";
  inlineWorker: boolean;
  now: string;
};

export type QueueRow = {
  id: string;
  reason: string;
  paypalStatus: string;
  stage: string;
  amountMinor: number;
  currency: string;
  sellerResponseDue: string | null;
  caseState: string;
  caseId?: string | null;
  strength?: "STRONG" | "MEDIUM" | "WEAK" | null;
  recommendedAction?: string | null;
  allowedActions?: string[];
  disputedTransactionId?: string | null;
  createdAtPaypal?: string | null;
};

export type Fact = {
  key: string;
  label: string;
  value: string | number | boolean;
  display: string;
  sourcePayloadId: string;
  jsonPath: string;
  fetchedAt: string;
  confidence: "PAYPAL" | "SELLER_UPLOAD" | "DERIVED";
};

export type ChecklistItem = {
  key: string;
  label: string;
  status: "MET" | "MISSING" | "CONFLICT" | "NOT_APPLICABLE";
  blocking: boolean;
  factKeys: string[];
  fix?: string;
};

export type Statement = { text: string; factKeys: string[] };
export type EvidenceDraft = {
  evidenceType: "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER";
  statements: Statement[];
  recommendation: {
    action: "FIGHT" | "ACCEPT" | "REVIEW";
    rationale: Statement[];
  };
};
export type VerifierReport = {
  accepted: Statement[];
  rejected: { statement: Statement; reason: string; detail?: string }[];
  notesText: string;
  citationAppendix: {
    factKey: string;
    label: string;
    display: string;
    payloadId: string;
    jsonPath: string;
  }[];
};
export type Money = { currency: string; minor: number };
export type DecisionAid = {
  recommended: "FIGHT" | "ACCEPT" | "REVIEW";
  evidenceType: string | null;
  because: string[];
  amountAtRisk: Money;
  costOfFighting: string;
  deadline: {
    dueAt: string | null;
    hoursLeft: number | null;
    band: "OK" | "SOON" | "URGENT" | "OVERDUE";
  };
  blockers: string[];
};
export type Submission = {
  id: string;
  action: string;
  status: "PENDING" | "SENT" | "DRY_RUN_STORED" | "FAILED";
  requestSnapshot: {
    method: string;
    path: string;
    contentType?: string;
    input: unknown;
  };
  responseSnapshot: unknown;
  approvedAt: string | null;
  sentAt: string | null;
  errorDetail: string | null;
  idempotencyKey: string;
};
export type CaseFile = {
  dispute: QueueRow & {
    disputeState: string | null;
    syncedAt: string | null;
    outcomeCode: string | null;
    latestPayloadId: string | null;
  };
  case: {
    id: string;
    state: string;
    errorDetail: string | null;
    updatedAt: string | null;
  } | null;
  kind: "INR" | "REFUND" | "GENERIC";
  facts: Fact[];
  checklist: ChecklistItem[];
  strength: "STRONG" | "MEDIUM" | "WEAK" | null;
  needsInfo: string[];
  evidenceType: string | null;
  decision: DecisionAid;
  rubric: string[];
  draft: {
    id: string;
    version: number;
    origin: string;
    model: string | null;
    promptVersion: string | null;
    content: EvidenceDraft;
    report: VerifierReport;
    passed: boolean;
    createdAt: string | null;
  } | null;
  submissions: Submission[];
  submitMode: "dry-run" | "live";
};
export type Payload = {
  id: string;
  source: string;
  ref: string;
  fetchedAt: string | null;
  payload: unknown;
};
export type RiskFlag = {
  id: string;
  rule: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  status: string;
  suggestedAction: string | null;
  firstSeenAt: string | null;
  transactionId: string;
  amountMinor: number;
  currency: string;
  occurredAt: string | null;
  trackingOnPaypal: boolean;
  canUpdatePaypal: boolean;
};
export type AuditRow = {
  id: number;
  at: string;
  actor: string;
  action: string;
  caseId: string | null;
  disputeId: string | null;
  flagId: string | null;
  detail: unknown;
};
export type FulfilmentRow = {
  orderRef: string;
  paypalTransactionId: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastScanAt: string | null;
  shipToPostal: string | null;
  shipToCountry: string | null;
  importedAt: string;
};
export type Thresholds = {
  noTrackingAfterHours: number;
  stuckTrackingDays: number;
  highValueMinor: number;
};
export type Settings = {
  mode: "live" | "replay";
  submitMode: "dry-run" | "live";
  paypalEnv: "sandbox";
  jobBackend: "postgres" | "render";
  paypalConfigured: boolean;
  webhookConfigured: boolean;
  llmModel: string | null;
  thresholds: Thresholds;
  lastScanAt: string | null;
  lastSyncCursor: string | null;
  jobs: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    max_attempts: number;
    run_at: string;
    last_error: string | null;
    created_at: string;
    finished_at: string | null;
  }[];
};
export type AnalyticsSource =
  "disputes" | "evidence_items" | "statements" | "risk_flags";

export type CopilotTurn = { role: "user" | "assistant"; content: string };
export type CopilotAnswer =
  | { available: false }
  | {
      available: true;
      answer: string;
      verified: boolean;
      facts: Fact[];
      toolCalls: { name: string; facts: number }[];
      model: string;
      promptVersion: string;
    };

export type ClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Called on any 401 so the app can send the user to the login screen. */
  onUnauthorized?: () => void;
};

export function createApiClient(o: ClientOptions = {}) {
  const base = o.baseUrl ?? "";
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      if (res.status === 401) o.onUnauthorized?.();
      const err = (
        json as
          | { error?: { code?: string; message?: string; details?: unknown } }
          | undefined
      )?.error;
      throw new ApiError(
        res.status,
        err?.code ?? "HTTP_ERROR",
        err?.message ?? `Request failed (${res.status})`,
        err?.details,
      );
    }
    return (json ?? text) as T;
  }
  const get = <T>(p: string) => call<T>("GET", p);
  const post = <T>(p: string, b: unknown = {}) => call<T>("POST", p, b);
  const enc = encodeURIComponent;

  return {
    health: () => get<Health>("/api/health"),
    login: (code: string) => post<{ ok: true }>("/api/auth/login", { code }),
    logout: () => post<{ ok: true }>("/api/auth/logout"),
    session: () => get<{ authenticated: true }>("/api/auth/session"),
    disputes: (q: { caseState?: string } = {}) =>
      get<{ items: QueueRow[] }>(
        `/api/disputes?limit=500${q.caseState ? `&caseState=${enc(q.caseState)}` : ""}`,
      ),
    caseFile: (id: string) => get<CaseFile>(`/api/disputes/${enc(id)}/case`),
    syncAll: () => post<{ ok: true }>("/api/disputes/sync"),
    preview: (id: string, action: "PROVIDE_EVIDENCE" | "ACCEPT_CLAIM") =>
      get<Submission["requestSnapshot"]>(
        `/api/disputes/${enc(id)}/preview?action=${action}`,
      ),
    /** A same-origin link (the session cookie goes with it); the browser downloads the PDF. */
    packetUrl: (id: string) => `${base}/api/disputes/${enc(id)}/packet.pdf`,
    copilot: (id: string, question: string, history: CopilotTurn[] = []) =>
      post<CopilotAnswer>(`/api/disputes/${enc(id)}/copilot`, {
        question,
        history,
      }),
    syncDispute: (id: string) =>
      post<{ ok: true }>(`/api/disputes/${enc(id)}/sync`),
    collect: (id: string) =>
      post<{ ok: true }>(`/api/disputes/${enc(id)}/collect`),
    regenerate: (id: string) =>
      post<{ ok: true }>(`/api/disputes/${enc(id)}/draft`, {
        mode: "generate",
      }),
    verifyDraft: (id: string, draft: EvidenceDraft) =>
      post<{
        draftId: string | null;
        version: number | null;
        report: VerifierReport;
        passed: boolean;
      }>(`/api/disputes/${enc(id)}/draft`, { mode: "verify", draft }),
    approveEvidence: (id: string, draftId: string) =>
      post<{ submissionId: string }>(`/api/disputes/${enc(id)}/approve`, {
        action: "PROVIDE_EVIDENCE",
        draftId,
        confirm: true,
      }),
    approveAccept: (id: string, comment?: string) =>
      post<{ submissionId: string }>(`/api/disputes/${enc(id)}/approve`, {
        action: "ACCEPT_CLAIM",
        confirm: true,
        ...(comment ? { comment } : {}),
      }),
    submit: (id: string) =>
      post<{ submissionId: string; status: "SENT" | "DRY_RUN_STORED" }>(
        `/api/disputes/${enc(id)}/submit`,
      ),
    payload: (id: string) => get<Payload>(`/api/payloads/${enc(id)}`),
    riskFlags: (status?: string) =>
      get<{ items: RiskFlag[] }>(
        `/api/risk/flags${status ? `?status=${enc(status)}` : ""}`,
      ),
    riskScan: (sinceDays = 30) =>
      post<{ flagged: number }>("/api/risk/scan", { sinceDays }),
    flagAction: (
      id: string,
      body:
        | { action: "DISMISS" }
        | { action: "ADD_TRACKING"; trackingNumber: string; carrier: string }
        | { action: "REFUND" },
    ) =>
      post<{ status: string }>(
        `/api/risk/flags/${enc(id)}/action`,
        body.action === "DISMISS" ? body : { ...body, confirm: true },
      ),
    importCsv: (csv: string) =>
      post<{ imported: number; replaced: number }>("/api/fulfilment/import", {
        csv,
      }),
    fulfilment: () => get<{ items: FulfilmentRow[] }>("/api/fulfilment"),
    sampleCsv: () => get<string>("/api/fulfilment/sample.csv"),
    audit: (disputeId?: string) =>
      get<{ items: AuditRow[] }>(
        `/api/audit${disputeId ? `?disputeId=${enc(disputeId)}` : ""}`,
      ),
    settings: () => get<Settings>("/api/settings"),
    setThresholds: (t: Thresholds) =>
      call<{ ok: true }>("PUT", "/api/settings/thresholds", t),
    seedDemo: () => post<{ ok: boolean; reason?: string }>("/api/demo/seed"),
    analytics: <T = Record<string, unknown>>(source: AnalyticsSource) =>
      get<{ rows: T[] }>(`/api/analytics/${source}`),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
