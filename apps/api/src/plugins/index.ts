import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import { registerAuth } from "./auth.js";
import { registerErrorHandling } from "./error-handler.js";

export async function registerPlugins(app: FastifyInstance, env: Env): Promise<void> {
  registerErrorHandling(app);

  await app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" } });
  await app.register(cors, {
    origin: [env.WEB_ORIGIN], // a list, so other origins get no allow header at all (AC-API-08)
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie, { secret: env.DS_COOKIE_SECRET });
  // Global ceiling; individual routes (login) set tighter limits.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  registerAuth(app, env);
}
