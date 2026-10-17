# AGENTS.md — rules for coding agents working on Dispute Shield

Read this first. It applies to every task. The specs live in `docs/` (this pack): `architecture.md`, `01`–`14`.

## 0. What this project is

Dispute Shield: an open-source dispute desk for small PayPal sellers, built for the "Build What's Next with PayPal and AI" hackathon. Respond to disputes with citation-backed, verified evidence; prevent disputes by flagging order gaps. Turborepo + pnpm, TypeScript. Next.js is the UI only; the backend is a separate **Fastify** service (`apps/api`); the database is **Supabase Postgres** (plain Postgres only) with Drizzle; the LLM is **Ollama Cloud**; background jobs run in Postgres or as **Render Workflows** tasks. **Sandbox only.**

Starter code already exists and is tested offline: `apps/api`, `apps/workflows`, `packages/schemas`, `packages/agent`, `packages/jobs`, `render.yaml`. Keep its tests green. It has never run against real PayPal, Supabase or Render; do not claim it has.

## 1. How to start any task

1. Identify your task row in `docs/07-implementation-plan.md` (ID like `P2-4`). If the user did not give one, ask for it or pick the next unfinished one in order.
2. Read, in this order: this file → `docs/architecture.md` (sections relevant to your package) → the spec for your package → `docs/03-paypal-api-contract.md` if you touch PayPal → the acceptance IDs in `docs/08-acceptance-criteria.md`.
3. Restate in two lines what you will build and which acceptance IDs it satisfies. Then build it.
4. Do only what the task says. Put ideas in `docs/backlog.md`, do not implement them.

## 2. Non-negotiable rules

1. **Sandbox only.** Never add a production PayPal URL, never read a production credential, never add a toggle for production. A CI check fails on any non-sandbox PayPal host.
2. **No outbound action without approval.** Writes to PayPal (provide-evidence, accept-claim, make-offer, add tracking, refund) happen only from a submission row that has `approved_by`, `approved_at`, a draft that passed the verifier (except accept-claim), and an idempotency key. In `DS_SUBMIT_MODE=dry-run` the gateway write methods must not be called.
3. **The LLM sees facts, not payloads.** Prompts contain fact key, label, display string and checklist status only. No buyer name, email, street address or phone. No raw PayPal JSON. Ollama Cloud has no structured-output mode: never rely on the model following a schema; parse, validate with zod, repair once, fall back to the template.
4. **Every statement is cited and verified.** Nothing derived from model output reaches PayPal unless `verifyDraft` accepted it.
5. **No win probability.** No percentages, no "likely", "chance" or "guaranteed" in any UI string, doc or prompt. Strength is a checklist result.
6. **Check the contract before using PayPal.** If a parameter, field, path or enum is not in `docs/03-paypal-api-contract.md` with ✅, do not use it. Mark it ⚠️ or ❓, write the question into the contract's "Open contract questions", and use a fixture-driven stub until a spike confirms it. Never invent an endpoint, scope, enum or field.
7. **Secrets.** Only read `process.env` in the allowed files (`apps/api/src/env.ts`, `apps/workflows/src/env.ts`, `apps/cli/src/lib/env.ts`, `apps/web/next.config.ts` for `API_ORIGIN`, package env loaders). Never log tokens, client secrets, full payloads, emails or addresses. Never commit `.env`, tokens or unredacted fixtures. The Ollama key, Render key, database URL and PayPal secrets exist only on the API and workflow servers: nothing in `apps/web`, its bundle, an API response, a log line or the OpenAPI document may contain them.
8. **Fixtures are redacted by code and read by a human.** Use `packages/paypal/src/live/redact.ts` and `ds record`. Fixture data must be synthetic ("Hearthside Ceramics").
9. **Boundaries.** `core` and `schemas` import nothing from `paypal`, `db`, `agent`, `ui`, `next`, `react`, `drizzle-orm`, `fastify` or `@renderinc/sdk`. `ui` imports nothing from `db`, `paypal`, `agent`, `jobs`. `apps/web` imports only `ui`, `schemas` and `api-client`: it has no route handlers and no database or PayPal access. `jobs` imports only `zod`. ESLint enforces this; do not disable the rule.
10. **Money is integer minor units** inside `core`. Format only at the edge.
11. **Webhooks:** capture the raw body before parsing, verify, insert the event ID atomically (unique), enqueue, return fast. Treat the payload as a hint; re-fetch the dispute before acting.
12. **Don't assert things you haven't seen.** If you did not run it, say you did not. Do not mark a task done with failing or skipped tests.
13. **Supabase connections.** Use the session pooler or the direct URL. Never the transaction pooler (port 6543) for the app, the migrations or the jobs queue. Enable RLS on every table with no public policy. Use no Supabase feature other than Postgres.
14. **The Studio analyst is read-only.** Its tools are exactly `viewSchema`, `viewReport`, `viewPage`, `viewWidget`, `executeQuery`. Adding a tool needs an explicit decision recorded in `docs/decisions/`.
15. **Never claim a tool you did not use.** The Devpost text, README and video name Render, APIMatic or AG Studio only for what the repo really does with them (`docs/14-prize-tracks.md` section 7).
16. **Both job backends behave the same.** Job handlers are written once and registered by the Postgres worker and the Render tasks; a parity test guards this. `process_dispute` never submits.

## 3. Code conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`. No `any` (use `unknown` + zod). No non-null assertions except in tests.
- zod at every boundary: HTTP input, PayPal responses, LLM output, CSV rows, env. PayPal schemas are lenient (`.passthrough()`), validate only what we use.
- Named exports (Next.js files that require default exports are the exception).
- Fastify routes: validate with `parse(schema, data)` in the handler, document with `doc({...})`, throw `AppError` subclasses, add an `app.inject()` test first. Checklist in `docs/13-api-service-spec.md` section 10.
- Errors: throw typed errors from `@ds/paypal/errors` or `@ds/core` result types; never swallow errors; map to HTTP in `apps/api/src/plugins/error-handler.ts`.
- Time: inject a `clock`; never call `Date.now()` in `core`.
- Logging: `pino` in apps only; include `requestId`, `jobId`, `disputeId`; no payloads.
- Tests next to the package (`test/`). Table-driven where rules are involved. Name tests after the rule (`rejects_date_off_by_one`).
- Commit style: Conventional Commits (`feat(core): …`). One logical change per commit. Do not commit generated build output.
- Dependencies: add the smallest set; pin exact versions you install; do not add UI kits, ORMs or state libraries not named in `architecture.md` without asking.

## 4. Commands

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm seed:demo
pnpm dev                 # web :3000 and api :4000
pnpm dev:workflows       # Render workflow tasks locally (optional)
pnpm openapi:export      # writes docs/openapi.json
pnpm openapi:check       # fails if it is stale
pnpm turbo run lint typecheck test --filter=<package>...
pnpm test:e2e            # replay mode
pnpm eval                # deterministic verifier evals
pnpm ds replay-check     # every fixture parses
pnpm ds spike <id>       # Day-0 spikes, needs sandbox credentials
```

Before saying a task is done: run lint, typecheck and tests for the touched packages and any dependants (`--filter=<package>...`).

## 5. Definition of done

1. Acceptance IDs claimed are listed in your summary and each has a test or recorded check.
2. Lint, typecheck, tests pass for touched packages.
3. No new secrets, `any`, boundary violations or `process.env` outside allowed files.
4. Specs updated in the same change if behaviour changed (`docs/*.md`).
5. PayPal-touching code: contract consulted, status marks updated, new fixtures redacted.
6. A short summary: what changed, what you ran, what you did not run, open questions.

## 6. What to do when blocked

- Missing information in a spec: ask one specific question; propose a default; continue with the default behind a clearly named constant.
- Spec conflict: `architecture.md` wins on structure; `03-paypal-api-contract.md` wins on PayPal facts; `08-acceptance-criteria.md` wins on behaviour. Write the conflict into `docs/decisions/`.
- A PayPal call fails in the sandbox: record the redacted request, response and `debug_id`; do not try random variations beyond what the spike describes; update the contract.
- Time pressure: cut Should/Could items per `07-implementation-plan.md` section 8; never cut verification, approval or tests.

## 7. Do not

- Do not add features outside the task.
- Do not weaken the verifier to make a test pass.
- Do not log or print tokens "just for debugging".
- Do not add telemetry, analytics or third-party scripts.
- Do not rewrite generated migrations; add a new one.
- Do not claim facts about PayPal behaviour you have not verified; mark them.
- Do not use PayPal logos or third-party trademarks in the UI, docs or demo assets.
- Do not store anything in `localStorage` that matters for correctness.
- Do not add a write tool to the Dispute analyst, an Ollama key to the browser, or a `NEXT_PUBLIC_` variable holding a secret.

## 8. Package quick reference

| Package | Purpose | Key spec |
| --- | --- | --- |
| `@ds/schemas` | zod types for everything crossing a boundary | `architecture.md` §6, `04-data-model.md` |
| `@ds/core` | pure logic: facts, checklists, verifier, decision, risk, state machines | `05-evidence-engine-spec.md` |
| `@ds/paypal` | gateway, live and replay adapters, webhook verification | `03-paypal-api-contract.md` |
| `@ds/db` | Drizzle schema, repos, Postgres job queue | `04-data-model.md` |
| `@ds/agent` | Ollama client, Studio turn handler, drafter, copilot, prompts, evals | `05-evidence-engine-spec.md` §4, §9; `13` §7 |
| `@ds/ui` | tokens, components, AG Grid wrappers, AG Studio (widgets, theme, analyst) | `06-ui-spec.md`, `14-prize-tracks.md` §2 |
| `@ds/fixtures` | redacted payloads + demo data | `03` §8 |
| `@ds/web` | Next.js UI only | `06-ui-spec.md`, `02` §4 |
| `@ds/api` | Fastify service: REST, webhook, cron, Studio LLM proxy, OpenAPI | `13-api-service-spec.md` |
| `@ds/jobs` | job kinds, payload schemas, runner shared by both backends | `14-prize-tracks.md` §3 |
| `@ds/workflows` | Render Workflows tasks and cron trigger | `14-prize-tracks.md` §3 |
| `@ds/api-client` | generated typed client for `apps/api` | `14-prize-tracks.md` §4 |
| `@ds/cli` | spikes, seeding, recording | `11-risks-and-day0-spikes.md` |

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
