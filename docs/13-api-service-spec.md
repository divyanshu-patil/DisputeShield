# 13. API service spec (`apps/api`, Fastify)

`apps/api` is the only backend the browser talks to. It owns HTTP, sessions, the PayPal webhook endpoint, the cron tick, the Studio LLM proxy and the OpenAPI document. Business rules stay in `@ds/core`, PayPal calls in `@ds/paypal`, SQL in `@ds/db`, model calls in `@ds/agent`; route handlers translate HTTP to a port call and back.

## 0. What already exists in this pack

A working starter is included under `apps/api`, `packages/schemas`, `packages/agent` and `packages/jobs`. It was typechecked and tested in a scratch workspace on 2026-10-17 (test counts: schemas 3, agent 26, api 44, jobs 6, workflows 6). It uses **in-memory adapters** for events, jobs and disputes, so it runs without a database. Your coding agent replaces the in-memory adapters with `@ds/db` and `@ds/paypal` implementations (tasks P1-3, P1-4, P1-7 in `07-implementation-plan.md`) and does not change the route contracts without updating this file.

What was **not** run: the code was never run against real Supabase, PayPal or Render. It was run against a live Ollama only through a mocked `fetch`. Treat the Ollama wire format as ✅ from docs, ❓ from behaviour until spike S9.

## 1. Stack

| Concern | Choice |
| --- | --- |
| Framework | Fastify 5 (`fastify ^5`) |
| Plugins | `@fastify/helmet` (CORP `cross-origin`), `@fastify/cors` (credentials, one origin `WEB_ORIGIN`), `@fastify/cookie` (signed), `@fastify/rate-limit`, `@fastify/swagger` (OpenAPI 3) |
| Validation | zod 4 in handlers via `parse(schema, data)`; Fastify's own validator and serializer are switched off. Route `schema` objects exist only to generate OpenAPI (`z.toJSONSchema(..., { target: "openapi-3.0" })`) |
| Logging | Fastify's pino logger, `requestId` on every line |
| Build | `tsup` to `dist/index.js`, `@ds/*` bundled in (`noExternal`); dev with `tsx watch --env-file=../../.env` |
| Tests | Vitest with `app.inject()`; no network |

## 2. Conventions

- Every route is under `/api`. JSON in, JSON out. 1 MB body limit (413; the `code` is Fastify's own `FST_ERR_CTP_BODY_TOO_LARGE`).
- Errors always have this shape: `{ "error": { "code": "...", "message": "...", "requestId": "...", "details": [...]? } }`. Codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `NOT_FOUND` 404, `CONFLICT` 409, `RATE_LIMITED` 429 (with `Retry-After`), `NOT_IMPLEMENTED` 501, 502/504 with a route-specific code (the LLM proxy uses `LLM_TIMEOUT` 504, `LLM_PROVIDER_AUTH` 502, and the provider error's own code for other 502s), `INTERNAL` 500. Errors raised by Fastify or its plugins keep their own `code`, or `BAD_REQUEST`.
- `x-request-id` is honoured if sent, otherwise generated, and echoed on the response.
- Config is read only in `src/env.ts` (zod). A bad config throws `EnvError` listing variable names and messages, never values.
- Typed `AppError` subclasses are thrown; one error handler maps them. Unknown errors become 500 `INTERNAL` with no detail.
- Composition happens only in `src/container.ts` (`buildContainer(env)`): it decides which adapter implements each port. Tests build the same app with `buildServer({ env, deps })`.

## 3. Routes

| Method and path | Auth | Purpose | Status in starter |
| --- | --- | --- | --- |
| `GET /api/health` | public | Mode, submit mode, PayPal env (always `sandbox`), job backend, database, LLM, last sync, last webhook, inline worker, time. No secrets | implemented |
| `POST /api/auth/login` | public, 10/min | `{ code }` equals `DS_DEMO_ACCESS_CODE` (timing-safe compare) sets cookie `ds_session` (signed, httpOnly, 12 h, `secure` in production, `SameSite=Lax`) | implemented |
| `POST /api/auth/logout` | session | Clears the cookie | implemented |
| `GET /api/auth/session` | session | `{ authenticated: true }` or 401 | implemented |
| `POST /api/webhooks/paypal` | PayPal signature | Capture raw body, verify, insert event atomically, enqueue `sync_dispute`, return fast (section 4) | implemented over memory adapters |
| `POST /api/cron/tick` | `x-cron-secret` | Run due jobs within `DS_TICK_BUDGET_SECONDS`, enqueue `sync_disputes` | implemented over memory queue |
| `GET /api/disputes` | session | Queue for the grid. Filters: `caseState`, `limit` | implemented over memory reader |
| `GET /api/disputes/:id` | session | One dispute with case state | implemented over memory reader |
| `POST /api/studio/llm/turn` | session, 30/min | One AG Studio agent turn, translated to Ollama Cloud (section 7) | implemented |
| `GET /api/openapi.json` | public | OpenAPI 3 document | implemented |
| `POST /api/disputes/:id/sync` | session | Enqueue `sync_dispute` ("Sync now") | to build (P1-8) |
| `GET /api/disputes/:id/case` | session | Case file: facts, checklist, strength, draft, verifier report | to build (P2-8) |
| `POST /api/disputes/:id/draft` | session | `{ mode: "generate" \| "verify" }`. `generate` enqueues `draft_case`; `verify` runs the verifier on an edited draft synchronously | to build (P2-9) |
| `POST /api/disputes/:id/approve` | session | Record approval of a draft version (`approved_by`, `approved_at`) | to build (P2-10) |
| `POST /api/disputes/:id/submit` | session | Send an approved submission (or store it in dry-run) with an idempotency key | to build (P2-11) |
| `GET /api/risk/flags`, `POST /api/risk/scan`, `POST /api/risk/flags/:id/action` | session | Prevent flow | to build (P3-1 to P3-4) |
| `GET /api/settings`, `GET /api/audit` | session | Setup page and audit trail | to build (P1-11, P2-12) |

Everything marked "to build" follows section 2. Add each to the OpenAPI document with `doc({...})`; CI fails if the committed `docs/openapi.json` drifts from the running app (`pnpm openapi:check`).

## 4. Webhook handler (the rules that matter)

Matches `architecture.md` section 5.1 and `08-acceptance-criteria.md` AC-WH.

1. A scoped content-type parser (`parseAs: "string"`) captures the **exact raw body** for `/api/webhooks/paypal` only. JSON parsing for that route happens after verification, from the raw string. Other routes use Fastify's normal JSON parser.
2. Verify with the five PayPal headers and the raw body through the `WebhookVerifier` port. In `DS_MODE=replay` the fixture verifier accepts only signature `fixture-valid`. In live mode with no real verifier configured it **fails closed**.
3. Insert the event row atomically (`ON CONFLICT (event_id) DO NOTHING`):
   - duplicate: respond 200, **no second job**;
   - unverified: store with `verified=false`, respond 400, **no job**;
   - new and verified: enqueue `sync_dispute` with `dedupeKey` = event id, respond 200.
4. The handler never calls PayPal and never runs a job inline. The body is a hint; the job re-reads the dispute.

## 5. Sessions and CORS

- One shared access code for the hosted demo. No user table.
- `app.requireSession` is a `preHandler`; `app.issueSession(reply)` sets the cookie.
- **Cookie across sites.** `SameSite=Lax` cookies are not sent on cross-site `fetch`. The web app therefore calls the API through a same-origin Next.js rewrite (`/api/:path*` → `API_ORIGIN`). CORS stays enabled for local development (`WEB_ORIGIN`, credentials) and for tools. If the rewrite cannot carry a long LLM turn, use the bearer-token fallback in `architecture.md` section 11 (add `POST /api/auth/token`, accept `Authorization: Bearer` in `requireSession`). Decide in spike S12. **This gap exists in the starter**: it only issues the cookie.
- Rate limits: 300/min global, 10/min login, 30/min LLM turn.

## 6. Jobs integration

`Deps.jobs` is a `JobQueue` (`enqueue`, `runDue`). Two implementations:

| `DS_JOB_BACKEND` | Class | `enqueue` | `runDue` | Inline worker |
| --- | --- | --- | --- | --- |
| `postgres` (default) | `PostgresJobQueue` in `@ds/db` (to build, P1-4) | insert a `jobs` row, dedupe on `dedupeKey` | claim with `SKIP LOCKED`, run via `@ds/jobs` `createJobRunner`, backoff on failure | on (`DS_INLINE_WORKER`) |
| `render` | `RenderJobQueue` in `apps/api/src/adapters/render-queue.ts` (**implemented**) | `render.workflows.startTask("<slug>/<kind>", [payload], { idempotencyKey })` | no-op `{ran:0, failed:0}` | forced off, and `/api/health` reports `jobBackend: "render"` |

`idempotencyKey` = `<kind>:<dedupeKey>` when the caller gives one, else `<kind>:t<5-minute bucket>:<sorted payload>`, cut to 200 characters (Render's key length limit is undocumented ❓). `RENDER_API_KEY` and `RENDER_WORKFLOW_SLUG` are required when `DS_JOB_BACKEND=render`.

Job payload schemas, the runner and the Render tasks are specified in `14-prize-tracks.md` section 3.

## 7. Studio LLM proxy (`POST /api/studio/llm/turn`)

Wire types live in `@ds/schemas` (`StudioTurnRequest`, `StudioTurnResponse`) and mirror the parts of AG Studio's `AgLlmRequest` / `AgLlmResponse` that we use (ag-studio 3.0.0 types, read 2026-10-17 ✅). Server side translation is `createStudioTurnHandler(client, defaultModel)` in `@ds/agent`.

| AG Studio | Ollama `/api/chat` |
| --- | --- |
| `instructions` | a leading `system` message |
| `input` message, role `user`/`system`/`assistant` | message with the concatenated text parts |
| `input` item `function_call` | assistant message with `tool_calls: [{ function: { name, arguments } }]` (arguments parsed from JSON string; unparsable → `{}` with a note) |
| `input` item `function_call_output` | message role `tool` with `tool_name` ⚠️ and the output |
| `tools[]` `{name, description, parameters}` | `tools: [{ type: "function", function: {...} }]` |
| `toolChoice: "none"` | send no tools |
| `toolChoice: "required"` or `{name}` | no parameter exists ⚠️; add one system sentence |
| `responseFormat: { type: "json" }` | JSON instruction appended to the system prompt; **`format` is never sent** (not available on cloud ✅) |
| `model.id` | `model` (else `LLM_MODEL`) |

Response mapping: assistant text → one output `message` with a single text part; each `tool_calls` entry → an output `function_call` with a generated `callId`. Status is `completed`, or `incomplete` when Ollama stops for length.

Errors: Ollama 429 → 429 with `Retry-After`; timeout → 504; bad key → 502 `LLM_PROVIDER_AUTH`; anything else → 502. With no `OLLAMA_API_KEY`, the replay `StudioLlm` answers honestly ("No language model is connected") rather than faking an answer.

`GET /api/health` calls `listModels()` (`GET /api/tags`) with a 5 s timeout and caches the result for 60 s.

## 8. Environment variables (`apps/api`)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `production` turns on `secure` cookies |
| `LOG_LEVEL` | no | `info` | |
| `API_HOST`, `API_PORT` | no | `0.0.0.0`, `4000` | Render injects `PORT`: map it (`API_PORT=$PORT`) in the start command or add a fallback ❓ |
| `WEB_ORIGIN` | no | `http://localhost:3000` | CORS origin |
| `DS_MODE` | no | `replay` | `live` requires PayPal vars and `DATABASE_URL` |
| `DS_SUBMIT_MODE` | no | `dry-run` | `live` requires `DS_MODE=live` |
| `PAYPAL_ENV` | no | `sandbox` | only the literal `sandbox` is accepted |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | live only | | sandbox app credentials |
| `DATABASE_URL` | live only | | Supabase **session pooler** or direct URL (never port 6543) |
| `DS_JOB_BACKEND` | no | `postgres` | `render` requires the next two |
| `RENDER_API_KEY`, `RENDER_WORKFLOW_SLUG` | if `render` | | server side only |
| `OLLAMA_API_KEY` | no | | no key = analyst replies with a notice and drafting uses templates |
| `OLLAMA_HOST` | no | `https://ollama.com` | `http://localhost:11434` for a local Ollama |
| `LLM_MODEL` | if key set | | pick in spike S9 |
| `DS_DEMO_ACCESS_CODE` | yes | | |
| `DS_COOKIE_SECRET` | yes | | at least 16 characters |
| `CRON_SECRET` | yes | | at least 8 characters |
| `DS_INLINE_WORKER` | no | `true` | ignored when the job backend is `render` |
| `DS_WORKER_INTERVAL_SECONDS`, `DS_TICK_BUDGET_SECONDS` | no | `30`, `20` | |

Cross-field rules enforced at startup: live mode needs PayPal credentials and a database URL; `DS_SUBMIT_MODE=live` needs `DS_MODE=live`; an Ollama key needs a model; the Render backend needs its key and slug.

## 9. Tests that exist (all offline)

`apps/api/test/api.test.ts` covers: env validation, health, login and session guards, disputes list, webhook cases (AC-WH-01 valid insert and enqueue, AC-WH-02 duplicate, AC-WH-03 unverified stored not enqueued, AC-WH-04 raw body preserved byte for byte, AC-WH-06 oversized body), cron secret and tick (AC-SYNC-06), error shape and request id, the OpenAPI document, the inline worker (no overlap, awaits in-flight work on stop), the Studio proxy (success, 401, 429 with `Retry-After`, 504, auth failure), the Ollama health probe cache, and the Render queue (env rules, slug and key, time bucketing, error hook, health). `packages/agent` covers the Ollama client (auth header, timeout, error mapping, never sends `format`), JSON extraction and the Studio translation. `packages/jobs` and `apps/workflows` cover payload validation, the runner and task chaining.

What a test cannot tell you: that PayPal, Supabase, Render or Ollama behave as the docs say. Spikes S1 to S12 do that.

## 10. How to add a route (checklist for the coding agent)

1. Write or extend the zod schema in `@ds/schemas`.
2. Add the port method if needed (`src/ports.ts`), an in-memory adapter, and the real adapter in `@ds/db` / `@ds/paypal`.
3. Add the route file under `src/routes/`, register it in `routes/index.ts`, call `parse()` in the handler, throw `AppError` subclasses, document it with `doc({...})`.
4. Write the `app.inject()` test first, including the 401 and 400 cases.
5. Run `pnpm openapi:export` and commit the updated `docs/openapi.json`.
6. Add or update the acceptance ID in `08-acceptance-criteria.md`.
