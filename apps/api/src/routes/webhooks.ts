import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../env.js";
import { ValidationError } from "../errors.js";
import { doc, ErrorBody } from "../openapi.js";
import type { Deps } from "../ports.js";

const MAX_WEBHOOK_BYTES = 1024 * 1024; // AC-WH-06

const PAYPAL_HEADERS = [
  "paypal-transmission-id",
  "paypal-transmission-time",
  "paypal-cert-url",
  "paypal-auth-algo",
  "paypal-transmission-sig",
] as const;

// Lenient: PayPal sends much more. We need the event id and type, and the dispute id when present.
const eventBody = z
  .object({
    id: z.string().min(1),
    event_type: z.string().min(1),
    resource: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

function disputeIdOf(resource: Record<string, unknown> | undefined): string | null {
  // Field name for the dispute id inside `resource` is unverified (spike S5): try the likely ones.
  const candidate = resource?.["dispute_id"] ?? resource?.["id"];
  return typeof candidate === "string" ? candidate : null;
}

export function webhookRoutes(app: FastifyInstance, _env: Env, deps: Deps): void {
  // Encapsulated plugin so the raw-body parser applies to the webhook route only.
  void app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: MAX_WEBHOOK_BYTES }, (req, body, done) => {
      // Keep the exact bytes: signatures are computed over them and we store them for audit.
      req.rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(new ValidationError("Body is not valid JSON"), undefined);
      }
    });

    scope.post(
      "/webhooks/paypal",
      {
        bodyLimit: MAX_WEBHOOK_BYTES,
        schema: doc({
          summary: "PayPal webhook intake (CUSTOMER.DISPUTE.*)",
          description:
            "Verifies the PayPal signature, stores the event once (event id is the idempotency key), enqueues a dispute sync. Unverified events are stored and answered 400. Max body 1 MB.",
          tags: ["webhooks"],
          body: eventBody,
          response: { 200: z.object({ ok: z.literal(true), duplicate: z.boolean() }), 400: ErrorBody, 413: ErrorBody },
        }),
      },
      async (req, reply) => {
      const rawBody = req.rawBody ?? "";
      const parsed = eventBody.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Not a PayPal event: missing id or event_type");
      const event = parsed.data;

      const headers: Record<string, string> = {};
      for (const name of PAYPAL_HEADERS) {
        const value = req.headers[name];
        if (typeof value === "string") headers[name] = value;
      }

      const verdict = await deps.verifier.verify({ headers, rawBody }).catch((err: unknown) => {
        req.log.warn({ err }, "webhook verification threw");
        return { ok: false, detail: "verifier_error" };
      });

      const resourceId = disputeIdOf(event.resource);
      const outcome = await deps.events.insert({
        id: event.id,
        eventType: event.event_type,
        resourceId,
        verified: verdict.ok,
        verificationDetail: verdict.detail,
        headers,
        bodyRaw: rawBody,
      });

      // Unverified events are kept for diagnosis but never cause work (AC-WH-03).
      if (!verdict.ok) {
        return reply.code(400).send({ error: { code: "WEBHOOK_UNVERIFIED", message: "Signature not verified", requestId: req.id } });
      }

      // Duplicates are acknowledged without a second job (AC-WH-02).
      if (outcome === "inserted" && resourceId) {
        await deps.jobs.enqueue({
          kind: "sync_dispute",
          payload: { disputeId: resourceId, eventId: event.id },
          dedupeKey: `sync_dispute:${resourceId}`,
        });
      }
      return reply.code(200).send({ ok: true, duplicate: outcome === "duplicate" });
      },
    );
  });
}
