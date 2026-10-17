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
