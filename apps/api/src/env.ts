import { z } from "zod";

// The only place in apps/api that reads process.env (AGENTS.md rule 7).

const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    API_HOST: z.string().min(1).default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // Browser origin allowed by CORS (the Next.js app). Credentials are allowed for this origin only.
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),

    DS_MODE: z.enum(["live", "replay"]).default("replay"),
    DS_SUBMIT_MODE: z.enum(["dry-run", "live"]).default("dry-run"),
    PAYPAL_ENV: z.literal("sandbox").default("sandbox"),
    PAYPAL_CLIENT_ID: z.string().optional(),
    PAYPAL_CLIENT_SECRET: z.string().optional(),
    PAYPAL_WEBHOOK_ID: z.string().optional(),

    // Supabase Postgres. Use the session pooler (port 5432) or the direct connection for the app and
    // migrations; the transaction pooler (6543) breaks prepared statements and advisory locks.
    DATABASE_URL: z.string().optional(),

    // Where background jobs run. "postgres": rows in the jobs table, run by the inline worker or the cron
    // tick. "render": each job is a Render Workflows task run.
    DS_JOB_BACKEND: z.enum(["postgres", "render"]).default("postgres"),
    RENDER_API_KEY: z.string().optional(),
    RENDER_WORKFLOW_SLUG: z.string().optional(),

    // LLM: Ollama Cloud (https://ollama.com). No key = the dispute analyst answers with a replay notice
    // and drafting falls back to templates.
    OLLAMA_API_KEY: z.string().optional(),
    OLLAMA_HOST: z.string().url().default("https://ollama.com"),
    LLM_MODEL: z.string().optional(),

    DS_DEMO_ACCESS_CODE: z.string().min(1),
    DS_COOKIE_SECRET: z.string().min(16),
    CRON_SECRET: z.string().min(8),

    // Run due jobs inside this process on a timer. Keep /api/cron/tick as a backup
    // for hosts that sleep when idle.
    DS_INLINE_WORKER: booleanString.default(true),
    DS_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
    DS_TICK_BUDGET_SECONDS: z.coerce.number().int().min(1).max(300).default(20),
  })
  .superRefine((env, ctx) => {
    if (env.DS_MODE === "live") {
      for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "DATABASE_URL"] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when DS_MODE=live` });
        }
      }
    }
    if (env.DS_JOB_BACKEND === "render") {
      for (const key of ["RENDER_API_KEY", "RENDER_WORKFLOW_SLUG"] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when DS_JOB_BACKEND=render` });
        }
      }
    }
    if (env.OLLAMA_API_KEY && !env.LLM_MODEL) {
      ctx.addIssue({ code: "custom", path: ["LLM_MODEL"], message: "LLM_MODEL is required when OLLAMA_API_KEY is set" });
    }
    if (env.DS_SUBMIT_MODE === "live" && env.DS_MODE !== "live") {
      ctx.addIssue({
        code: "custom",
        path: ["DS_SUBMIT_MODE"],
        message: "DS_SUBMIT_MODE=live requires DS_MODE=live",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Report names and messages only. Never echo values (they may be secrets).
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return parsed.data;
}
