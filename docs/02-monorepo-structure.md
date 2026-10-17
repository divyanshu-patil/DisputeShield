# 02. Monorepo structure (Turborepo + pnpm)

Verified on 2026-10-17: Turborepo's config uses the top-level key `tasks` (not `pipeline`), `dependsOn` with `^` waits for the same task in dependency packages, and `envMode` defaults to `"strict"`, which filters environment variables to those declared in `env` and `globalEnv` ✅ ([turborepo.dev configuration reference](https://turborepo.dev/docs/reference/configuration)). The docs imply the current major is 2.x but do not state it ❓, so install the latest and pin it.

Versions copied from PayPal's AG Studio starter (`paypaldev/hackathon-paypal-ag-grid-boilerplate`, `package.json`, read 2026-10-17) ✅: `next` 16.3.6, `react` and `react-dom` 19.2.8, `ag-grid-community` and `ag-grid-react` 36.2.0, `ag-studio` and `ag-studio-react` 3.0.0, `tailwindcss` ^4, `typescript` ^5, `eslint` ^9. The starter's README asks for Node 20.9+. Its README also describes use of `@paypal/paypal-server-sdk`, but its `package.json` does not list that package ❓; do not assume the SDK is installed.

## 1. Full tree

```text
dispute-shield/
├─ apps/
│  ├─ web/                          Next.js app: UI, route handlers, webhook endpoint
│  └─ cli/                          `ds` command: spikes, seeding, fixtures, evals
├─ packages/
│  ├─ schemas/                      zod schemas + types (no deps)
│  ├─ core/                         pure domain logic
│  ├─ paypal/                       REST client, gateway, live + replay adapters
│  ├─ db/                           Drizzle schema, migrations, repos, job queue
│  ├─ agent/                        LLM drafter, copilot, prompts, evals
│  ├─ ui/                           tokens, components, AG Grid / AG Studio wrappers
│  ├─ fixtures/                     redacted PayPal payloads + demo shop data
│  ├─ config-typescript/            tsconfig bases
│  └─ config-eslint/                shared ESLint flat config
├─ docs/                            this pack (copied in), ADRs, runbooks
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     └─ cron-tick.yml
├─ docker-compose.yml               local Postgres
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.json                    extends @ds/config-typescript/base.json
├─ .env.example
├─ .gitignore
├─ .nvmrc
├─ .prettierrc
├─ AGENTS.md                        rules for coding agents
├─ CLAUDE.md                        one line: "Read AGENTS.md"
├─ LICENSE                          MIT or Apache-2.0, must be detectable by GitHub
└─ README.md                        quickstart, architecture diagram, demo steps
```

## 2. Root files

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `package.json`

```json
{
  "name": "dispute-shield",
  "private": true,
  "packageManager": "pnpm@PIN_THE_VERSION_YOU_INSTALL",
  "engines": { "node": ">=20.9" },
  "scripts": {
    "dev": "turbo run dev --filter=@ds/web",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e --filter=@ds/web",
    "db:generate": "turbo run db:generate --filter=@ds/db",
    "db:migrate": "turbo run db:migrate --filter=@ds/db",
    "eval": "turbo run eval --filter=@ds/agent",
    "ds": "pnpm --filter @ds/cli exec ds",
    "seed:demo": "pnpm --filter @ds/cli exec ds seed:demo",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "prettier": "latest-at-install",
    "turbo": "latest-at-install",
    "typescript": "^5"
  }
}
```

Replace `latest-at-install` with the exact version `pnpm add -D -w` writes; do not leave the placeholder.

### `turbo.json`

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "envMode": "strict",
  "globalDependencies": ["tsconfig.json", ".env.example"],
  "globalEnv": ["NODE_ENV", "DS_MODE", "DS_SUBMIT_MODE", "PAYPAL_ENV", "LLM_PROVIDER", "LLM_MODEL", "APP_BASE_URL"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": ["DATABASE_URL", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "ANTHROPIC_API_KEY", "CRON_SECRET", "DS_DEMO_ACCESS_CODE", "AG_STUDIO_LICENSE_KEY"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "env": ["DATABASE_URL", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "ANTHROPIC_API_KEY", "CRON_SECRET", "DS_DEMO_ACCESS_CODE", "AG_STUDIO_LICENSE_KEY"]
    },
    "lint": {},
    "typecheck": {},
    "test": {
      "outputs": ["coverage/**"],
      "env": ["DATABASE_URL_TEST"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false,
      "env": ["DATABASE_URL", "CRON_SECRET", "DS_DEMO_ACCESS_CODE"]
    },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false, "env": ["DATABASE_URL"] },
    "eval": { "cache": false, "env": ["ANTHROPIC_API_KEY"] }
  }
}
```

Notes:
- Under `strict` mode a variable that is not listed arrives as `undefined` at runtime. If something is "missing in dev but present in the shell", add it here.
- The name of the AG Studio licence variable is a placeholder ❓. Use whatever AG Studio's licence page specifies (spike S10).
- `lint` and `typecheck` do not depend on `^build` because internal packages are consumed as source (ADR-002).

### `tsconfig.json` (root)

```json
{ "extends": "@ds/config-typescript/base.json", "files": [], "references": [] }
```

### `.env.example`

```dotenv
# --- Mode ---------------------------------------------------------------
# replay = serve recorded fixtures, no PayPal credentials needed (judge default)
# live   = call the PayPal SANDBOX (there is no production mode)
DS_MODE=replay
# dry-run stores the exact request but sends nothing; live sends to the sandbox
DS_SUBMIT_MODE=dry-run
PAYPAL_ENV=sandbox
# Optional: force one replay scenario (DS-001 … DS-004); empty = pick by dispute ID
DS_SCENARIO=

# --- PayPal sandbox (merchant REST app) ----------------------------------
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
# CLI spikes only: sandbox buyer used to open disputes and sign auth assertions
PAYPAL_SANDBOX_BUYER_EMAIL=

# --- Data ---------------------------------------------------------------
DATABASE_URL=postgres://ds:ds@localhost:5432/ds
DATABASE_URL_TEST=postgres://ds:ds@localhost:5432/ds_test

# --- LLM ----------------------------------------------------------------
LLM_PROVIDER=anthropic
LLM_MODEL=
ANTHROPIC_API_KEY=

# --- App ----------------------------------------------------------------
APP_BASE_URL=http://localhost:3000
DS_DEMO_ACCESS_CODE=change-me
CRON_SECRET=change-me
# Name and mechanism to be confirmed in spike S10
AG_STUDIO_LICENSE_KEY=

# --- Tuning (assumptions, not facts; shown in the UI) -------------------
DS_NO_TRACKING_AFTER_HOURS=48
DS_STUCK_TRACKING_DAYS=5
DS_HIGH_VALUE_THRESHOLD=200
DS_HIGH_VALUE_CURRENCY=USD
```

### `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ds
      POSTGRES_PASSWORD: ds
      POSTGRES_DB: ds
    ports: ["5432:5432"]
    volumes: ["ds-pg:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ds"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  ds-pg:
```

Create the test database once: `docker compose exec db createdb -U ds ds_test`.

## 3. Shared config packages

### `packages/config-typescript`

```text
packages/config-typescript/
├─ package.json            name @ds/config-typescript, exports the JSON files
├─ base.json
├─ nextjs.json
└─ node.json
```

`base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true
  }
}
```

`nextjs.json` extends base, adds `"lib": ["ES2023", "DOM", "DOM.Iterable"]`, `"jsx": "preserve"`, `"plugins": [{ "name": "next" }]`, `"allowJs": true`. `node.json` extends base with `"types": ["node"]`.

### `packages/config-eslint`

```text
packages/config-eslint/
├─ package.json
├─ base.mjs                 typescript-eslint, import ordering, no-floating-promises
├─ next.mjs                 extends base + eslint-config-next
└─ boundaries.mjs           no-restricted-imports rules below
```

Boundary rules (`boundaries.mjs`) to implement:
- In `packages/core` and `packages/schemas`: forbid imports of `@ds/paypal`, `@ds/db`, `@ds/agent`, `@ds/ui`, `next`, `react`, `drizzle-orm`, `ai`, `@ai-sdk/*`.
- In `packages/ui`: forbid `@ds/db`, `@ds/paypal`, `@ds/agent`.
- In `apps/web/src/components` and client components: forbid `@ds/db` and `@ds/paypal` (server only).
- Forbid `process.env` outside `apps/web/src/server/env.ts`, `apps/cli/src/lib/env.ts`, and package `env` loaders.

## 4. Package internals

Each internal package uses the same `package.json` shape (just-in-time consumption, ADR-002):

```json
{
  "name": "@ds/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "@ds/schemas": "workspace:*" },
  "devDependencies": {
    "@ds/config-eslint": "workspace:*",
    "@ds/config-typescript": "workspace:*",
    "typescript": "^5",
    "vitest": "latest-at-install"
  }
}
```

Next must be told to compile them: in `apps/web/next.config.ts`, set `transpilePackages` to `["@ds/schemas","@ds/core","@ds/paypal","@ds/db","@ds/agent","@ds/ui","@ds/fixtures"]`.

### `packages/schemas`

```text
src/
├─ index.ts
├─ fact.ts                  Fact, FactKey union
├─ evidence.ts              EvidenceStatement, EvidenceDraft, VerifierReport
├─ dispute.ts               Dispute (normalised), DisputeReason, PaypalStatus, Stage
├─ transaction.ts           Transaction (normalised from reporting API)
├─ order.ts                 Order, Tracker, Capture, Refund (normalised)
├─ fulfilment.ts            FulfilmentRecord + CSV row schema
├─ risk.ts                  RiskRule, RiskFlag, Severity
├─ decision.ts              DecisionAid, Strength, ChecklistItem
├─ api.ts                   request and response DTOs for every route in apps/web
└─ paypal/                  zod subsets of PayPal payloads we read (lenient: passthrough unknown keys)
   ├─ dispute-details.ts
   ├─ dispute-list.ts
   ├─ transaction-search.ts
   ├─ order-details.ts
   └─ webhook-event.ts
```

PayPal payload schemas are lenient (`.passthrough()`), validate only the fields we use, and log (not throw) when optional fields are absent.

### `packages/core`

```text
src/
├─ index.ts
├─ facts/
│  ├─ extract-dispute.ts        dispute.* facts from DisputeDetails
│  ├─ extract-transaction.ts    txn.* facts (amount, status, protection_eligibility, shipping, items)
│  ├─ extract-order.ts          order.*, tracking.*, refund.* facts
│  ├─ extract-fulfilment.ts     fulfil.* facts
│  └─ build-case-file.ts        merges everything, returns { facts, missing[] }
├─ checklist/
│  ├─ inr.ts                    items for MERCHANDISE_OR_SERVICE_NOT_RECEIVED
│  ├─ refund-based.ts           CREDIT_NOT_PROCESSED, DUPLICATE_TRANSACTION when a refund exists
│  ├─ generic.ts                other reasons: manual path
│  └─ strength.ts               STRONG | MEDIUM | WEAK from checklist coverage
├─ verifier/
│  ├─ verify.ts                 verifyDraft(draft, facts) → VerifierReport
│  └─ tokens.ts                 extract numbers, dates, IDs from a sentence; match to fact displays
├─ decision/
│  ├─ decide.ts                 DecisionAid from strength, deadline, refund state
│  └─ money.ts                  amount at risk, currency-safe arithmetic (integer minor units)
├─ risk/
│  ├─ rules.ts                  R-PROT, R-ADDR, R-NOTRACK, R-STUCK, R-HIGH
│  └─ evaluate.ts               evaluateRisk(txn, fulfilment, now, config) → RiskFlag[]
├─ state/
│  ├─ case-machine.ts           allowed transitions, guard functions
│  └─ submission-machine.ts
├─ time/
│  └─ deadlines.ts              dueInHours, isOverdue, urgency bands
└─ templates/
   └─ fallback-statements.ts    model-free evidence sentences built from facts
test/                            one spec per module, plus property tests for money and verifier
```

### `packages/paypal`

```text
src/
├─ index.ts
├─ gateway.ts                   PayPalGateway interface + Raw<T>
├─ errors.ts                    error taxonomy
├─ env.ts                       reads mode and credentials
├─ live/
│  ├─ client.ts                 fetch wrapper: base URL, headers, retries, redaction, recorder hook
│  ├─ auth.ts                   client-credentials token + cache + refresh on 401
│  ├─ disputes.ts               list, get, provide-evidence, accept-claim, make-offer, send-message
│  ├─ reporting.ts              GET /v1/reporting/transactions with date windowing (≤ 31 days)
│  ├─ orders.ts                 GET /v2/checkout/orders/{id}
│  ├─ tracking.ts               add tracking ⚠️
│  ├─ refunds.ts                refund capture ⚠️
│  ├─ multipart.ts              builds multipart bodies (input JSON part + document parts)
│  ├─ redact.ts                 strips secrets and personal data for logs and fixtures
│  └─ recorder.ts               writes Raw<T> to packages/fixtures when RECORD=1
├─ replay/
│  ├─ replay-gateway.ts         serves fixtures by (operation, scenario)
│  └─ scenarios.ts              scenario registry: DS-001 … DS-004, RISK-001 …
├─ webhooks/
│  ├─ verify-postback.ts        POST /v1/notifications/verify-webhook-signature ✅
│  ├─ verify-offline.ts         certificate-based RSA-SHA256 check ⚠️ (works for simulator events)
│  └─ events.ts                 event name constants
└─ sandbox-only/                 used by the CLI only, never imported by apps/web
   ├─ create-dispute.ts         POST /v1/customer/disputes with PayPal-Auth-Assertion ✅
   ├─ require-evidence.ts       POST …/require-evidence ✅
   └─ adjudicate.ts             POST …/adjudicate ✅
test/                            msw-based contract tests against fixtures
```

### `packages/db`

```text
drizzle.config.ts
drizzle/                         generated SQL migrations (committed)
src/
├─ index.ts
├─ client.ts                     pg pool, drizzle instance
├─ migrate.ts
├─ schema/
│  ├─ events.ts                  paypal_events
│  ├─ payloads.ts                raw_payloads
│  ├─ disputes.ts                disputes, cases
│  ├─ facts.ts                   facts
│  ├─ drafts.ts                  drafts, submissions
│  ├─ transactions.ts            transactions
│  ├─ fulfilment.ts              fulfilment_records
│  ├─ risk.ts                    risk_flags
│  ├─ audit.ts                   audit_log
│  ├─ jobs.ts                    jobs
│  └─ settings.ts                settings
├─ repos/                        one repository per aggregate; no business rules here
└─ jobs/
   ├─ queue.ts                   enqueue, claim (FOR UPDATE SKIP LOCKED), complete, fail
   └─ run-due.ts                 time-boxed runner used by the cron tick
```

Table definitions are in `04-data-model.md`.

### `packages/agent`

```text
src/
├─ index.ts
├─ model.ts                      provider factory from LLM_PROVIDER / LLM_MODEL
├─ drafter/
│  ├─ draft.ts                   draftEvidence(facts, context) with one repair retry, then fallback
│  └─ schema.ts                  zod output schema (from @ds/schemas)
├─ copilot/
│  ├─ copilot.ts                 tool-using chat over one case
│  ├─ toolkit.ts                 @paypal/agent-toolkit/ai-sdk, read tools only
│  └─ record-tools.ts            wraps each tool so results land in raw_payloads and facts
├─ prompts/
│  ├─ drafter.v1.ts
│  └─ copilot.v1.ts
└─ eval/
   ├─ cases/                     golden/*.json and adversarial/*.json
   ├─ scorers.ts
   └─ run.ts                     `pnpm eval`
```

### `packages/ui`

```text
src/
├─ index.ts
├─ tokens.css                    colour, spacing, type, radius tokens; light and dark
├─ theme.ts                      AG Grid and AG Studio theme objects built from the tokens
├─ components/
│  ├─ Badge.tsx  Button.tsx  Card.tsx  Drawer.tsx  EmptyState.tsx  Toast.tsx
│  ├─ Countdown.tsx              time to seller_response_due_date, urgency colours
│  ├─ MoneyAtRisk.tsx
│  ├─ StrengthMeter.tsx          STRONG / MEDIUM / WEAK with checklist hover
│  ├─ CitationChip.tsx           [txn.shipping_info] chip inside a sentence
│  ├─ FactDrawer.tsx             shows the raw record snippet behind a fact
│  └─ ModeBanner.tsx             replay vs live, dry-run vs live submit
├─ grid/
│  ├─ QueueGrid.tsx
│  ├─ columns.ts
│  └─ cell-renderers/
└─ studio/
   ├─ DisputeHealthStudio.tsx
   ├─ studio-theme.ts
   └─ widgets/                   custom AG Studio widgets (see 06-ui-spec.md)
```

### `packages/fixtures`

```text
paypal/
├─ oauth/token.json
├─ disputes/
│  ├─ list.open.json
│  ├─ DS-001.inr-strong.details.json
│  ├─ DS-002.inr-no-tracking.details.json
│  ├─ DS-003.credit-not-processed.details.json
│  └─ DS-004.unauthorised-manual.details.json
├─ transactions/
│  ├─ DS-001.search.json  …  RISK-001.search.json  RISK-002.search.json
├─ orders/
│  └─ DS-001.order.json  …
├─ webhooks/
│  ├─ dispute-created.body.json
│  └─ dispute-created.headers.json
└─ responses/                    provide-evidence, accept-claim, make-offer, error cases (400, 403, 404)
demo-shop/
├─ fulfilment.csv
└─ return-policy.md
src/
├─ index.ts
├─ load.ts                       typed loader
├─ redact.ts                     replaces names, emails, addresses with synthetic data
└─ builders.ts                   builds new scenarios programmatically
```

Rule: no fixture is committed unless it was passed through `redact.ts` and a human has read it once.

### `apps/web`

```text
package.json  next.config.ts  tsconfig.json  postcss.config.mjs  playwright.config.ts
e2e/
├─ queue.spec.ts
├─ case-review-submit.spec.ts
├─ prevent-scan.spec.ts
├─ health-dashboard.spec.ts
└─ setup-health.spec.ts
src/
├─ app/
│  ├─ layout.tsx  globals.css
│  ├─ login/page.tsx
│  ├─ (app)/
│  │  ├─ layout.tsx               shell: nav, ModeBanner, deadline ticker
│  │  ├─ page.tsx                 redirects to /disputes
│  │  ├─ disputes/page.tsx        queue
│  │  ├─ disputes/[id]/page.tsx   case workspace
│  │  ├─ risk/page.tsx            risk radar
│  │  ├─ health/page.tsx          AG Studio dashboard
│  │  ├─ fulfilment/page.tsx      CSV import and table
│  │  ├─ audit/page.tsx
│  │  └─ setup/page.tsx
│  └─ api/                        see table below
├─ components/                    page-level components composed from @ds/ui
├─ server/
│  ├─ env.ts                      the only place process.env is read
│  ├─ container.ts                wires gateway, repos, agent from env
│  ├─ auth.ts                     access-code cookie
│  ├─ http.ts                     zod-validated handler helper, error mapping
│  └─ jobs.ts                     handlers registered per job kind
├─ middleware.ts                  gates (app) routes behind the access code
└─ instrumentation.ts             logger setup
```

#### Route handlers

| Route | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/webhooks/paypal` | POST | Verify signature, store event, enqueue sync | PayPal signature |
| `/api/cron/tick` | POST | Run due jobs for a time budget, enqueue periodic sync | `CRON_SECRET` header |
| `/api/health` | GET | Mode, last sync, last webhook, LLM reachability | none (no secrets in body) |
| `/api/sync` | POST | Enqueue `sync_disputes` now | access code |
| `/api/disputes` | GET | Queue rows with filters | access code |
| `/api/disputes/[id]` | GET | Case, facts, draft, submissions | access code |
| `/api/disputes/[id]/collect` | POST | Re-run collection | access code |
| `/api/disputes/[id]/draft` | POST | Body `{ mode: "generate" }` drafts and verifies; `{ mode: "verify", content }` only re-verifies an edited draft (no model call) and stores a `HUMAN_EDIT` version | access code |
| `/api/disputes/[id]/approve` | POST | Record approval of a draft version and action | access code |
| `/api/disputes/[id]/submit` | POST | Send or store (dry-run) the approved action | access code |
| `/api/disputes/[id]/accept` | POST | Accept claim path | access code |
| `/api/disputes/[id]/copilot` | POST | Copilot message (should-have) | access code |
| `/api/risk/scan` | POST | Enqueue `scan_transactions` | access code |
| `/api/risk/flags` | GET | Flags with filters | access code |
| `/api/risk/flags/[id]/action` | POST | `add-tracking`, `refund`, `dismiss` | access code |
| `/api/fulfilment/import` | POST | CSV upload, validated against `@ds/schemas` | access code |
| `/api/analytics/[source]` | GET | Arrays for AG Studio data sources | access code |
| `/api/audit` | GET | Audit rows | access code |

### `apps/cli`

```text
package.json                     "bin": { "ds": "./src/index.ts" } run through tsx
src/
├─ index.ts                      commander entry
├─ commands/
│  ├─ spike.ts                   ds spike s0|s1|…|s10 (see 11-risks-and-day0-spikes.md)
│  ├─ seed-demo.ts               loads the demo shop into Postgres from fixtures
│  ├─ seed-sandbox.ts            creates sandbox orders and captures for the demo shop
│  ├─ record.ts                  ds record <operation> --scenario DS-001
│  ├─ replay-check.ts            verifies every fixture parses against @ds/schemas
│  ├─ webhook-simulate.ts        posts a fixture webhook to a running app
│  └─ eval.ts                    runs @ds/agent evals
└─ lib/
   ├─ env.ts
   ├─ auth-assertion.ts          builds the PayPal-Auth-Assertion JWT for sandbox buyer calls ✅ (needs client ID + buyer email)
   └─ print.ts
```

## 5. CI workflows

`.github/workflows/ci.yml` (outline):

```yaml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: ds, POSTGRES_PASSWORD: ds, POSTGRES_DB: ds_test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U ds" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DS_MODE: replay
      DS_SUBMIT_MODE: dry-run
      DATABASE_URL_TEST: postgres://ds:ds@localhost:5432/ds_test
      DATABASE_URL: postgres://ds:ds@localhost:5432/ds_test
      CRON_SECRET: ci
      DS_DEMO_ACCESS_CODE: ci
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: pnpm turbo run lint typecheck test
      - run: pnpm --filter @ds/web exec playwright install --with-deps chromium
      - run: pnpm test:e2e
```

Pin action versions to whatever is current when you create the file; the majors above are placeholders ❓. Add a secret-scan step (for example gitleaks) before `install`.

`.github/workflows/cron-tick.yml` (outline):

```yaml
name: cron-tick
on:
  schedule: [{ cron: "*/5 * * * *" }]
  workflow_dispatch: {}
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -fsS -X POST "$APP_BASE_URL/api/cron/tick"
          -H "x-cron-secret: $CRON_SECRET"
        env:
          APP_BASE_URL: ${{ secrets.APP_BASE_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

GitHub may delay or skip scheduled runs ⚠️, which is why the UI also has "Sync now" and the webhook path exists.

## 6. Day-to-day commands

```bash
docker compose up -d                  # Postgres
pnpm install
cp .env.example .env                  # then edit
pnpm db:migrate
pnpm seed:demo                        # demo shop into the database (replay mode)
pnpm dev                              # http://localhost:3000, log in with DS_DEMO_ACCESS_CODE

pnpm ds spike s1                      # Day-0 spike, needs live sandbox credentials
pnpm ds record dispute.get --scenario DS-001
pnpm ds replay-check
pnpm eval                             # LLM verifier evals
pnpm turbo run test --filter=@ds/core # one package
pnpm turbo run build --filter=@ds/web...
```

## 7. Adding a package

1. `mkdir packages/<name>`; copy `package.json` from `@ds/core`; change `name` and dependencies.
2. Add the path to `transpilePackages` in `apps/web/next.config.ts` if the web app imports it.
3. Add its boundary rule to `config-eslint/boundaries.mjs`.
4. Add it to the dependency graph in `architecture.md` section 4.1.
5. `pnpm install` and run `pnpm turbo run lint typecheck test --filter=@ds/<name>`.

## 8. Conventions

- Conventional Commits (`feat(core): …`, `fix(paypal): …`). One logical change per commit.
- Branches: `feat/<area>-<short>`, `fix/<area>-<short>`, `spike/<id>`.
- Strict TypeScript, zod at every boundary (HTTP in, PayPal in, LLM out, CSV in, env in).
- No default exports except Next.js files that require them.
- Money in integer minor units inside `@ds/core`; format only at the edge.
- Dates stored as UTC `timestamptz`; the UI renders in the viewer's time zone and shows relative time for deadlines.
