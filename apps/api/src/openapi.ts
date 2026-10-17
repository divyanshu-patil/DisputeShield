import swagger from "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

// OpenAPI is generated from the same zod schemas the handlers validate with, so the document the
// APIMatic SDK/docs are built from cannot drift from the code. Route `schema` here is documentation
// only: Fastify's own validation is switched off (see server.ts) and handlers call `parse()`.

type Doc = {
  summary: string;
  tags: string[];
  description?: string;
  body?: z.ZodType;
  querystring?: z.ZodType;
  params?: z.ZodType;
  response?: Record<number, z.ZodType>;
  /** True for routes that need the session cookie. */
  secured?: boolean;
  /** True for routes that need the x-cron-secret header. */
  cronSecret?: boolean;
};

function js(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: "openapi-3.0", unrepresentable: "any" }) as Record<string, unknown>;
  delete out["$schema"];
  return out;
}

export function doc(d: Doc): Record<string, unknown> {
  return {
    summary: d.summary,
    tags: d.tags,
    ...(d.description ? { description: d.description } : {}),
    ...(d.body ? { body: js(d.body) } : {}),
    ...(d.querystring ? { querystring: js(d.querystring) } : {}),
    ...(d.params ? { params: js(d.params) } : {}),
    ...(d.response ? { response: Object.fromEntries(Object.entries(d.response).map(([code, s]) => [code, { description: "Response", ...js(s) }])) } : {}),
    ...(d.secured ? { security: [{ sessionCookie: [] }] } : {}),
    ...(d.cronSecret ? { security: [{ cronSecret: [] }] } : {}),
  };
}

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.unknown().optional() }),
});

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Dispute Shield API",
        version: "0.1.0",
        description:
          "Backend for Dispute Shield: PayPal dispute sync, evidence drafting with a deterministic verifier, human-approved submission, and risk scanning. Sandbox only.",
        license: { name: "MIT" },
      },
      servers: [{ url: "http://localhost:4000", description: "Local" }],
      tags: [
        { name: "system", description: "Health and scheduling" },
        { name: "auth", description: "Demo access-code session" },
        { name: "webhooks", description: "PayPal webhook intake" },
        { name: "disputes", description: "Dispute queue and cases" },
        { name: "studio", description: "LLM proxy and analytics for the AG Studio dashboard" },
        { name: "risk", description: "Prevent: risk flags on recent payments" },
        { name: "fulfilment", description: "Seller fulfilment CSV" },
      ],
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: "ds_session" },
          cronSecret: { type: "apiKey", in: "header", name: "x-cron-secret" },
        },
      },
    },
  });

  app.get("/api/openapi.json", { schema: { hide: true } }, async () => app.swagger());
}
