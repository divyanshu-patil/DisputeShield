import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../env.js";
import { UnauthorizedError } from "../errors.js";

export const SESSION_COOKIE = "ds_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

declare module "fastify" {
  interface FastifyInstance {
    requireSession: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Constant-time string comparison that does not leak the length of the secret. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ab.length === bb.length;
}

export function registerAuth(app: FastifyInstance, env: Env): void {
  app.decorate("requireSession", async (req: FastifyRequest) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) throw new UnauthorizedError();
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value !== "ok") throw new UnauthorizedError();
  });

  app.decorate("issueSession", (reply: FastifyReply) => {
    reply.setCookie(SESSION_COOKIE, "ok", {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });
}

declare module "fastify" {
  interface FastifyInstance {
    issueSession: (reply: FastifyReply) => void;
  }
}
