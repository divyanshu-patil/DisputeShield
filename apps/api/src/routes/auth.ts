import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../env.js";
import { UnauthorizedError } from "../errors.js";
import { safeEqual, SESSION_COOKIE } from "../plugins/auth.js";
import { doc, ErrorBody } from "../openapi.js";
import { parse } from "../validate.js";

const Ok = z.object({ ok: z.literal(true) });

const loginBody = z.object({ code: z.string().min(1).max(200) });

export function authRoutes(app: FastifyInstance, env: Env): void {
  app.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: doc({ summary: "Exchange the demo access code for a session cookie", tags: ["auth"], body: loginBody, response: { 200: Ok, 401: ErrorBody } }),
    },
    async (req, reply) => {
      const { code } = parse(loginBody, req.body);
      if (!safeEqual(code, env.DS_DEMO_ACCESS_CODE)) throw new UnauthorizedError("Wrong access code");
      app.issueSession(reply);
      return { ok: true };
    },
  );

  app.post("/auth/logout", { schema: doc({ summary: "Clear the session cookie", tags: ["auth"], response: { 200: Ok } }) }, async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/session", { preHandler: app.requireSession, schema: doc({ summary: "Check the session", tags: ["auth"], secured: true, response: { 200: z.object({ authenticated: z.literal(true) }), 401: ErrorBody } }) }, async () => ({ authenticated: true }));
}
