import { existsSync } from "node:fs";
import { z } from "zod";

// The only place in apps/cli that reads process.env (AGENTS.md rule 7).

const ROOT_ENV = new URL("../../../../.env", import.meta.url);

const PayPalCredentials = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
});

/** Loads the repo-root .env (shell variables win), then validates. Errors name keys, never values. */
export function paypalCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const parsed = PayPalCredentials.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Missing in .env: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return {
    clientId: parsed.data.PAYPAL_CLIENT_ID,
    clientSecret: parsed.data.PAYPAL_CLIENT_SECRET,
  };
}

/** PAYPAL_WEBHOOK_ID for spike S5 (signature verification postback). */
export function paypalWebhookId(): string {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const id = z.string().min(1).safeParse(process.env["PAYPAL_WEBHOOK_ID"]);
  if (!id.success) throw new Error("Missing in .env: PAYPAL_WEBHOOK_ID");
  return id.data;
}

const Ollama = z.object({
  OLLAMA_API_KEY: z.string().min(1),
  OLLAMA_HOST: z.string().url().default("https://ollama.com"),
  LLM_MODEL: z.string().min(1),
});

/** Ollama Cloud settings for spike S9. Errors name keys, never values. */
export function ollamaConfig(): {
  apiKey: string;
  host: string;
  model: string;
} {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const parsed = Ollama.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Missing in .env: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return {
    apiKey: parsed.data.OLLAMA_API_KEY,
    host: parsed.data.OLLAMA_HOST,
    model: parsed.data.LLM_MODEL,
  };
}
