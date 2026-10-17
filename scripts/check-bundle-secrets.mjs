// AC-LLM-05 / 09 section 8: no secret value may reach the browser bundle or the OpenAPI document.
// Run after `pnpm turbo run build --filter=@ds/web`. Reads the secrets from the environment (and .env when
// present), so it checks the real values, then prints file names only, never the values.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const NAMES = [
  "OLLAMA_API_KEY",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_CLIENT_ID",
  "DATABASE_URL",
  "DATABASE_URL_TEST",
  "DS_COOKIE_SECRET",
  "CRON_SECRET",
  "DS_DEMO_ACCESS_CODE",
  "RENDER_API_KEY",
  "PAYPAL_WEBHOOK_ID",
];
// Short values ("ci") would match by chance; 8 characters is below every real secret here.
const secrets = NAMES.flatMap((n) => {
  const v = process.env[n];
  return v && v.length >= 8 ? [[n, v]] : [];
});
const PATTERNS = [[/postgres(?:ql)?:\/\/[^\s"'`]+@/, "a database URL"]];

const targets = [
  join(root, "apps/web/.next/static"),
  join(root, "docs/openapi.json"),
];
if (!existsSync(targets[0])) {
  console.error("apps/web/.next/static not found: build the web app first.");
  process.exit(2);
}

const files = [];
const walk = (p) => {
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory())
    for (const f of readdirSync(p)) walk(join(p, f));
  else if (/\.(js|css|html|json|map|txt)$/.test(p)) files.push(p);
};
targets.forEach(walk);
if (!files.some((f) => f.endsWith(".js"))) {
  console.error(
    "No JavaScript in apps/web/.next/static: the build is missing or incomplete.",
  );
  process.exit(2);
}

const hits = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const [name, value] of secrets)
    if (text.includes(value))
      hits.push(`${f.slice(root.length)}: value of ${name}`);
  for (const [re, what] of PATTERNS)
    if (re.test(text)) hits.push(`${f.slice(root.length)}: ${what}`);
}

if (hits.length > 0) {
  console.error(`Secrets found in shipped files:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(
  `No secrets in ${files.length} files (checked ${secrets.length} secret values).`,
);
