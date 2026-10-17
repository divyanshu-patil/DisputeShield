import { ANALYTICS_VIEWS, type AnalyticsSource } from "@ds/db";
import { RiskThresholds } from "@ds/schemas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../env.js";
import { ErrorBody, doc } from "../openapi.js";
import type { Deps } from "../ports.js";
import { parse } from "../validate.js";
import { requireServices } from "./cases.js";

// Prevent, fulfilment, audit, settings and analytics routes (P1-11, P2-12, P3-1 to P3-4, 14 section 2.3).

const flagAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DISMISS") }),
  z.object({ action: z.literal("ADD_TRACKING"), trackingNumber: z.string().min(4).max(64).regex(/^[A-Za-z0-9-]+$/), carrier: z.string().min(2).max(40), confirm: z.literal(true) }),
  z.object({ action: z.literal("REFUND"), confirm: z.literal(true) }),
]);

export function opsRoutes(app: FastifyInstance, env: Env, deps: Deps): void {
  const secured = { preHandler: app.requireSession };
  const d = (summary: string, tags: string[], extra: Record<string, unknown> = {}) =>
    doc({ summary, tags, secured: true, response: { 401: ErrorBody, 501: ErrorBody }, ...extra });

  app.get("/risk/flags", { ...secured, schema: d("Risk flags with the payment they belong to", ["risk"], { querystring: z.object({ status: z.string().max(20).optional() }) }) }, async (req) => {
    const q = parse(z.object({ status: z.enum(["OPEN", "ACTIONED", "DISMISSED", "AUTO_CLEARED"]).optional() }), req.query);
    return { items: await requireServices(deps).pipeline.listFlags(q.status) };
  });

  app.post("/risk/scan", { ...secured, schema: d("Scan recent payments for dispute risk", ["risk"]) }, async (req) => {
    const q = parse(z.object({ sinceDays: z.coerce.number().int().min(1).max(30).default(7) }), req.body ?? {});
    return requireServices(deps).pipeline.scanTransactions(q.sinceDays);
  });

  app.post("/risk/flags/:id/action", { ...secured, schema: d("Act on a flag: add tracking, refund or dismiss", ["risk"], { body: flagAction }) }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(flagAction, req.body);
    return requireServices(deps).pipeline.flagAction(id, body.action === "ADD_TRACKING" ? { action: body.action, trackingNumber: body.trackingNumber, carrier: body.carrier } : { action: body.action });
  });

  app.post("/fulfilment/import", { ...secured, schema: d("Import the fulfilment CSV", ["fulfilment"], { body: z.object({ csv: z.string().min(1).max(900_000) }) }) }, async (req) => {
    const body = parse(z.object({ csv: z.string().min(1).max(900_000) }), req.body);
    return requireServices(deps).pipeline.importFulfilment(body.csv);
  });

  app.get("/fulfilment", { ...secured, schema: d("Imported fulfilment rows", ["fulfilment"]) }, async () => {
    const rows = await requireServices(deps).repos.fulfilment.list();
    // No names or street lines in the list view.
    return { items: rows.map((r) => ({ orderRef: r.orderRef, paypalTransactionId: r.paypalTransactionId, carrier: r.carrier, trackingNumber: r.trackingNumber, shippedAt: r.shippedAt, deliveredAt: r.deliveredAt, lastScanAt: r.lastScanAt, shipToPostal: r.shipToPostal, shipToCountry: r.shipToCountry, importedAt: r.importedAt })) };
  });

  app.get("/fulfilment/sample.csv", { ...secured, schema: d("Demo fulfilment CSV (fixes DS-002)", ["fulfilment"]) }, async (_req, reply) => {
    return reply.type("text/csv").header("content-disposition", 'attachment; filename="fulfilment-demo.csv"').send(requireServices(deps).sampleCsv());
  });

  app.get("/audit", { ...secured, schema: d("Audit trail, newest first", ["system"]) }, async (req) => {
    const q = parse(z.object({ disputeId: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }), req.query);
    const rows = await requireServices(deps).repos.audit.list({ limit: q.limit, ...(q.disputeId ? { disputeId: q.disputeId } : {}) });
    return { items: rows };
  });

  app.get("/settings", { ...secured, schema: d("Setup page: modes, connections, thresholds, recent jobs", ["system"]) }, async () => {
    const s = requireServices(deps);
    const [thresholds, jobs, lastScan, cursor] = await Promise.all([
      s.pipeline.thresholds(),
      s.queue ? s.queue.recent(25) : Promise.resolve([]),
      s.repos.settings.get<string>("risk.last_scan_at"),
      s.repos.settings.get<string>("sync.last_dispute_cursor"),
    ]);
    return {
      mode: env.DS_MODE,
      submitMode: env.DS_SUBMIT_MODE,
      paypalEnv: env.PAYPAL_ENV,
      jobBackend: env.DS_JOB_BACKEND,
      paypalConfigured: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
      webhookConfigured: !!env.PAYPAL_WEBHOOK_ID,
      llmModel: env.OLLAMA_API_KEY ? (env.LLM_MODEL ?? null) : null,
      thresholds,
      lastScanAt: lastScan,
      lastSyncCursor: cursor,
      jobs,
    };
  });

  app.put("/settings/thresholds", { ...secured, schema: d("Change the Prevent thresholds", ["system"], { body: RiskThresholds }) }, async (req) => {
    await requireServices(deps).pipeline.setThresholds(parse(RiskThresholds, req.body));
    return { ok: true };
  });

  app.post("/demo/seed", { ...secured, schema: d("Reset and reload the demo scenarios (replay mode only)", ["system"]) }, async () => {
    if (env.DS_MODE !== "replay") return { ok: false, reason: "Only in replay mode; use `pnpm seed:demo --force` for live." };
    return { ok: true, result: await requireServices(deps).seed() };
  });

  app.get("/analytics/:source", { ...secured, schema: d("PII-free analytics rows for the dashboard", ["studio"]) }, async (req) => {
    const { source } = parse(z.object({ source: z.enum(Object.keys(ANALYTICS_VIEWS) as [AnalyticsSource, ...AnalyticsSource[]]) }), req.params);
    return { rows: await requireServices(deps).repos.analytics.view(source) };
  });
}
