import { EvidenceDraft } from "@ds/schemas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotImplementedError } from "../errors.js";
import { ErrorBody, doc } from "../openapi.js";
import type { Deps, Services } from "../ports.js";
import { parse } from "../validate.js";

// Case workspace routes (13 section 3, P1-8 and P2-8 to P2-11). Handlers translate HTTP to a pipeline call.

const idParams = z.object({ id: z.string().min(1).max(100) });
const Ok = z.object({ ok: z.literal(true) });
const draftBody = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate") }),
  z.object({ mode: z.literal("verify"), draft: EvidenceDraft }),
]);
const previewQuery = z.object({ action: z.enum(["PROVIDE_EVIDENCE", "ACCEPT_CLAIM"]), comment: z.string().max(500).optional() });
const approveBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PROVIDE_EVIDENCE"), draftId: z.string().uuid(), confirm: z.literal(true) }),
  z.object({ action: z.literal("ACCEPT_CLAIM"), comment: z.string().max(500).optional(), confirm: z.literal(true) }),
]);

export function requireServices(deps: Deps): Services {
  if (!deps.services) throw new NotImplementedError("This route needs a database (set DATABASE_URL).");
  return deps.services;
}

export function caseRoutes(app: FastifyInstance, deps: Deps): void {
  const secured = { preHandler: app.requireSession };
  const r = (summary: string, extra: Parameters<typeof doc>[0] extends infer D ? Partial<D> : never = {}) =>
    doc({ summary, tags: ["disputes"], secured: true, params: idParams, response: { 401: ErrorBody, 404: ErrorBody, 409: ErrorBody, 501: ErrorBody }, ...extra });

  app.get("/disputes/:id/case", { ...secured, schema: r("Case file: facts, checklist, decision aid, draft, verifier report, submissions") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return requireServices(deps).pipeline.caseFile(id);
  });

  app.post("/disputes/:id/sync", { ...secured, schema: r("Re-read this dispute from PayPal (Sync now)", { response: { 202: Ok } }) }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    requireServices(deps);
    await deps.jobs.enqueue({ kind: "sync_dispute", payload: { disputeId: id }, dedupeKey: `sync_dispute:${id}` });
    return reply.code(202).send({ ok: true });
  });

  app.post("/disputes/:id/collect", { ...secured, schema: r("Re-collect facts (after a CSV import)", { response: { 202: Ok } }) }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await requireServices(deps).pipeline.recollect(id);
    return reply.code(202).send({ ok: true });
  });

  app.post("/disputes/:id/draft", { ...secured, schema: r("Generate a draft (job) or verify an edited draft (now)", { body: draftBody }) }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const body = parse(draftBody, req.body);
    const s = requireServices(deps);
    if (body.mode === "generate") {
      await s.pipeline.regenerate(id);
      return reply.code(202).send({ ok: true });
    }
    return s.pipeline.verifyEdit(id, body.draft);
  });

  app.post("/disputes/:id/approve", { ...secured, schema: r("Record the owner's approval of the latest verified draft, or of accepting the claim", { body: approveBody }) }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(approveBody, req.body);
    return requireServices(deps).pipeline.approve(id, body.action === "PROVIDE_EVIDENCE" ? { action: body.action, draftId: body.draftId } : { action: body.action, ...(body.comment ? { comment: body.comment } : {}) });
  });

  app.post("/disputes/:id/submit", { ...secured, schema: r("Send the approved submission to PayPal, or store it in dry-run") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return requireServices(deps).pipeline.submit(id);
  });

  app.get("/disputes/:id/preview", { ...secured, schema: r("The exact request approving would send (no side effects)", { querystring: previewQuery }) }, async (req) => {
    const { id } = parse(idParams, req.params);
    const q = parse(previewQuery, req.query);
    return requireServices(deps).pipeline.preview(id, q.action === "ACCEPT_CLAIM" ? { action: q.action, ...(q.comment ? { comment: q.comment } : {}) } : { action: q.action });
  });

  app.post("/disputes/sync", { ...secured, schema: doc({ summary: "Sync all disputes from PayPal (Sync now)", tags: ["disputes"], secured: true, response: { 202: Ok, 401: ErrorBody } }) }, async (_req, reply) => {
    requireServices(deps);
    await deps.jobs.enqueue({ kind: "sync_disputes", payload: {}, dedupeKey: "sync_disputes" });
    return reply.code(202).send({ ok: true });
  });

  app.get("/payloads/:id", { ...secured, schema: r("Raw PayPal payload behind a fact (redacted)") }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return requireServices(deps).pipeline.payload(id);
  });
}
