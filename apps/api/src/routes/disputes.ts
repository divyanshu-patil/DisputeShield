import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../errors.js";
import { doc, ErrorBody } from "../openapi.js";
import type { Deps } from "../ports.js";
import { parse } from "../validate.js";

const listQuery = z.object({
  caseState: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const idParams = z.object({ id: z.string().min(1).max(100) });
const DisputeRowSchema = z.object({
  id: z.string(),
  reason: z.string(),
  paypalStatus: z.string(),
  stage: z.string(),
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  sellerResponseDue: z.string().nullable(),
  caseState: z.string(),
  caseId: z.string().nullable().optional(),
  strength: z.string().nullable().optional(),
  recommendedAction: z.string().nullable().optional(),
  allowedActions: z.array(z.string()).optional(),
  disputedTransactionId: z.string().nullable().optional(),
  createdAtPaypal: z.string().nullable().optional(),
});

export function disputeRoutes(app: FastifyInstance, deps: Deps): void {
  app.get(
    "/disputes",
    { preHandler: app.requireSession, schema: doc({ summary: "List disputes, nearest deadline first", tags: ["disputes"], secured: true, querystring: listQuery, response: { 200: z.object({ items: z.array(DisputeRowSchema) }), 401: ErrorBody } }) },
    async (req) => {
    const q = parse(listQuery, req.query);
    const rows = await deps.disputes.list({ limit: q.limit, ...(q.caseState ? { caseState: q.caseState } : {}) });
    return { items: rows };
    },
  );

  app.get(
    "/disputes/:id",
    { preHandler: app.requireSession, schema: doc({ summary: "One dispute", tags: ["disputes"], secured: true, params: idParams, response: { 200: DisputeRowSchema, 404: ErrorBody, 401: ErrorBody } }) },
    async (req) => {
    const { id } = parse(idParams, req.params);
    const row = await deps.disputes.get(id);
    if (!row) throw new NotFoundError("Dispute not found");
    return row;
    },
  );
}
