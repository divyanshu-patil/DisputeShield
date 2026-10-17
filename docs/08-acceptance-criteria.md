# 08. Acceptance criteria

Format: Given / When / Then. Every ID is referenced by the implementation plan and the test plan. **Priority** is M (Must), S (Should), C (Could). **Verified by** says how the criterion is checked: `U` unit test, `C` contract test on fixtures, `I` integration test (Postgres), `E` Playwright e2e in replay mode, `L` live sandbox rehearsal (manual, recorded), `M` manual check.

Scenario names refer to the demo shop "Hearthside Ceramics" (fictional): DS-001 INR strong, DS-002 INR with no tracking, DS-003 credit not processed with refund, DS-004 unsupported reason (unauthorised). Risk fixtures: RISK-001 (unprotected + address mismatch), RISK-002 (no tracking after 48 h).

## AC-WH — Webhook intake

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-WH-01 | M | **Given** a webhook with valid PayPal headers and body, **when** it is POSTed to `/api/webhooks/paypal`, **then** the signature is verified, one `paypal_events` row is stored with `verified=true`, a `sync_dispute` job is enqueued for the event's dispute ID, and the response is 200 within 2 seconds. | I, L |
| AC-WH-02 | M | **Given** the same event ID arrives twice, **when** the second is POSTed, **then** no second row and no second job are created and the response is 200. | I |
| AC-WH-03 | M | **Given** a webhook whose verification result is not `SUCCESS`, **when** it is POSTed, **then** the event is stored with `verified=false`, no job is enqueued, and the response is 400. | I |
| AC-WH-04 | M | **Given** the raw body is captured before JSON parsing, **when** the event is stored, **then** `body_raw` equals the exact bytes received. | I |
| AC-WH-05 | M | **Given** events arrive out of order (RESOLVED before UPDATED), **when** both are processed, **then** the dispute ends in the state PayPal currently reports because jobs re-fetch details instead of trusting payloads. | I |
| AC-WH-06 | S | **Given** the webhook endpoint receives a payload over 1 MB, **when** it is POSTed, **then** it is rejected with 413 and nothing is stored. | I |

## AC-SYNC — Dispute sync and jobs

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-SYNC-01 | M | **Given** the gateway lists disputes, **when** `sync_disputes` runs, **then** each dispute is upserted with reason, status, stage, amount, deadline and allowed actions, and a `cases` row exists for every dispute that needs seller action. | I |
| AC-SYNC-02 | M | **Given** `sync_disputes` ran at time T, **when** it runs again, **then** it requests `update_time_after = T − 10 min` and creates no duplicate rows. | C, I |
| AC-SYNC-03 | M | **Given** two workers claim jobs simultaneously, **when** both call `claim`, **then** no job is claimed twice. | I |
| AC-SYNC-04 | M | **Given** a job fails, **when** retries occur, **then** `run_at` follows exponential backoff up to `max_attempts`, after which status is `DEAD` and the error is visible on the Setup page. | I |
| AC-SYNC-05 | M | **Given** a job stays `RUNNING` for more than 10 minutes, **when** the tick runs, **then** the reaper requeues it. | I |
| AC-SYNC-06 | M | **Given** `/api/cron/tick` is called without the correct secret, **when** it is requested, **then** it returns 401 and runs nothing. | I |
| AC-SYNC-07 | M | **Given** a dispute has no `allowed_actions`, **when** it is synced, **then** its case is not offered any submit action. | U |
| AC-SYNC-08 | M | **Given** the gateway returns 401, **when** a job runs, **then** the token is refreshed once and the call retried once; a second 401 produces `AuthError` and a visible setup warning. | C |
| AC-SYNC-09 | M | **Given** the gateway returns 429, **when** a job runs, **then** it is rescheduled honouring `Retry-After` if present. | C |

## AC-CASE — Case collection

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-CASE-01 | M | **Given** DS-001 fixtures, **when** `collect_case` runs, **then** facts exist for every key the INR checklist uses, each with `sourcePayloadId`, `jsonPath` and `fetchedAt`, and the case state becomes `READY`. | U, I |
| AC-CASE-02 | M | **Given** DS-002 (no tracking anywhere), **when** `collect_case` runs, **then** the case state is `NEEDS_INFO`, the checklist shows INR-1 `MISSING`, and strength is `WEAK`. | U, I |
| AC-CASE-03 | M | **Given** a missing field in a PayPal payload, **when** extraction runs, **then** no placeholder fact is created and the case lists the item under `needs_info`. | U |
| AC-CASE-04 | M | **Given** the CSV tracking number differs from the PayPal tracker, **when** facts are built, **then** both are kept, the checklist item is `CONFLICT`, and drafting is blocked until the owner resolves it. | U |
| AC-CASE-05 | M | **Given** the owner uploads a valid fulfilment CSV for DS-002's transaction, **when** they press Re-collect, **then** the case moves `NEEDS_INFO → COLLECTING → READY`. | I, E |
| AC-CASE-06 | M | **Given** DS-004 (unsupported reason), **when** `collect_case` runs, **then** `recommended_action = MANUAL`, no draft is generated, and the UI says Dispute Shield does not draft evidence for this reason yet. | U, E |
| AC-CASE-07 | M | **Given** the case state machine, **when** an invalid transition is requested (for example `NEW → SUBMITTED`), **then** it is refused with a typed error and nothing is persisted. | U |
| AC-CASE-08 | M | **Given** a dispute is past `seller_response_due`, **when** the tick runs, **then** the case becomes `EXPIRED` and every submit action is disabled. | U, I |

## AC-EVID — Drafting

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-EVID-01 | M | **Given** DS-001 facts and a working model, **when** drafting runs, **then** the draft has between 1 and 8 statements, each with at least one valid fact key, and the draft is stored with `model`, `prompt_version`, `origin = MODEL`. | I, L |
| AC-EVID-02 | M | **Given** no API key or a model timeout (30 s), **when** drafting runs, **then** a draft with `origin = TEMPLATE_FALLBACK` is produced from facts only, passes the verifier, and the UI shows the "AI drafting unavailable" banner. | U, E |
| AC-EVID-03 | M | **Given** the model reply is not parseable JSON, or parses but violates the zod schema (Ollama Cloud has no structured-output mode ✅, so this is an expected case), **when** drafting runs, **then** one repair attempt is made with the error text; if still invalid the template fallback is used. | U |
| AC-EVID-04 | M | **Given** the prompt input, **when** it is built, **then** it contains no buyer name, email, street address or phone number and no raw payloads. | U |
| AC-EVID-05 | M | **Given** the drafter output, **when** the draft is persisted, **then** `evidenceType` is one of the allowed types for the case. | U |
| AC-EVID-06 | M | **Given** blocking checklist items are missing, **when** drafting runs, **then** no evidence statements are produced and the recommendation is `REVIEW` with an explanation of what is missing. | U |

## AC-VER — Verifier

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-VER-01 | M | A statement with no `factKeys` is rejected `NO_CITATION`. | U |
| AC-VER-02 | M | A statement citing a key not present in the case's latest facts is rejected `UNKNOWN_FACT`. | U |
| AC-VER-03 | M | A statement containing a tracking number that differs from the cited fact is rejected `VALUE_MISMATCH`. | U |
| AC-VER-04 | M | A date shifted by one day, or in a different written format that resolves to a different date, is rejected `VALUE_MISMATCH`; the same date in a different format that resolves to the same date is accepted. | U |
| AC-VER-05 | M | An amount with a different currency or different minor-unit value is rejected `VALUE_MISMATCH`. | U |
| AC-VER-06 | M | The word "delivered" without a cited `fulfil.delivered_at` (or equivalent) fact is rejected `UNKNOWN_FACT`; likewise "refunded" and "shipped". | U |
| AC-VER-07 | M | A statement longer than 400 characters is rejected `TOO_LONG`. | U |
| AC-VER-08 | M | `notesText` never exceeds 2000 characters and ends on a full sentence. | U |
| AC-VER-09 | M | `verifier_passed` is true only if at least one statement is accepted, none rejected, and all blocking checklist items are MET. | U |
| AC-VER-10 | M | A fact value containing instruction-like text ("ignore previous rules") does not change verifier results and is shown to the model as data. | U, eval |
| AC-VER-11 | M | The adversarial eval set (fabricated tracking number, wrong date, wrong amount, uncited claim, invented carrier) is rejected 100% of the time; the eval run fails CI otherwise. | eval |
| AC-VER-12 | S | When the owner edits a statement, the verifier runs again before the edit can be approved; a failing edit cannot be approved. | E |

## AC-DEC — Decision aid

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-DEC-01 | M | STRONG (INR-1, INR-3, INR-4 met, no conflict) yields `FIGHT`. | U |
| AC-DEC-02 | M | WEAK with no way to fix before the deadline yields `ACCEPT` when an accept link exists. | U |
| AC-DEC-03 | M | Missing `provide-evidence` link prevents `FIGHT` and the UI explains why. | U |
| AC-DEC-04 | M | Deadline bands: under 24 h `URGENT`, under 72 h `SOON`, past due `OVERDUE`; `OVERDUE` blocks submit. | U |
| AC-DEC-05 | M | The UI never displays a percentage chance, the words "likely", "chance" or "guaranteed" in the decision panel (checked by a text lint over UI strings). | U |
| AC-DEC-06 | M | A full refund already exists → recommendation is `FIGHT` with `PROOF_OF_REFUND`, never `ACCEPT`. | U |
| AC-DEC-07 | M | The decision panel shows amount at risk using integer minor-unit arithmetic; 0.1 + 0.2 style rounding errors cannot occur (property test). | U |

## AC-SUB — Approval and submission

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-SUB-01 | M | **Given** a draft with `verifier_passed = false`, **when** the owner tries to approve, **then** the API refuses with 422 and the button is disabled with a reason. | I, E |
| AC-SUB-02 | M | **Given** an approved draft in `DS_SUBMIT_MODE=dry-run`, **when** submit is pressed, **then** a `submissions` row with `DRY_RUN_STORED` and a full `request_snapshot` exists, nothing is sent to PayPal, and the UI shows "exactly what would be sent". | I, E |
| AC-SUB-03 | M | **Given** live mode and an open `provide-evidence` link, **when** submit is pressed, **then** a multipart request is sent with `evidence_type`, tracking info and notes, the result is stored, and the case becomes `SUBMITTED`. | L |
| AC-SUB-04 | M | **Given** PayPal returns an error, **when** submit runs, **then** the submission is `FAILED` with `debug_id` and message stored, the case stays actionable, and the UI says nothing was changed. | C, E |
| AC-SUB-05 | M | **Given** a submission row is created, **then** it has `approved_by`, `approved_at`, `draft_id`, and a unique `idempotency_key`. | I |
| AC-SUB-06 | M | **Given** a submit request is replayed with the same idempotency key, **then** no second PayPal call is made. | I |
| AC-SUB-07 | M | **Given** the owner accepts a claim, **when** they confirm the amount dialog, **then** `accept-claim` with `accept_claim_type = REFUND` is sent (or stored in dry-run) and audit rows exist. | C, E |
| AC-SUB-08 | M | **Given** no `accept-claim` link exists, **then** the accept action is hidden or disabled with a reason. | U |
| AC-SUB-09 | M | **Given** a case is `EXPIRED` or `OVERDUE`, **then** no submit action can be executed via UI or API. | I |
| AC-SUB-10 | M | **Given** any submit, **then** `audit_log` has `APPROVED` and `SUBMITTED` or `DRY_RUN_STORED` entries with actor `owner`. | I |
| AC-SUB-11 | M | **Given** the code base, **then** there is no PayPal base URL other than the sandbox host and no code path that reads a production URL (static check in CI). | U |
| AC-SUB-12 | S | A PDF evidence packet can be downloaded for a case and contains the accepted statements, citation appendix and timestamps. | E |

## AC-RISK — Prevent module

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-RISK-01 | S | **Given** RISK-001 (protection `02`, mismatching postal code), **when** a scan runs, **then** `R-PROT` and `R-ADDR` flags exist with reasons built from facts. | U, I |
| AC-RISK-02 | S | **Given** RISK-002 (paid 50 h ago, no tracking), **when** a scan runs, **then** an `R-NOTRACK` flag with `ADD_TRACKING` suggestion exists; at 47 h it does not. | U |
| AC-RISK-03 | S | **Given** a flag is open, **when** the underlying condition resolves (tracking added), **then** a re-scan sets it `AUTO_CLEARED`. | U, I |
| AC-RISK-04 | S | **Given** the owner confirms Add tracking in dry-run, **then** the exact request is stored and audit logged; in live mode the tracking call is made with an idempotency key. | I, L |
| AC-RISK-05 | S | **Given** the owner opens Refund, **then** they must type the amount to confirm; a mismatch disables the button. | E |
| AC-RISK-06 | S | **Given** thresholds change on Setup, **when** the next scan runs, **then** the new values apply and the change is audit logged. | I |
| AC-RISK-07 | S | **Given** Transaction Search returns data older than 3 hours, **then** the UI shows the "data may be up to 3 hours old" note with the newest fetch time. | E |
| AC-RISK-08 | S | **Given** a date range longer than 31 days, **when** a scan runs, **then** the client splits it into windows of at most 30 days and merges results without duplicates. | C |
| AC-RISK-09 | C | `R-STUCK` and `R-HIGH` rules behave as specified in `05-evidence-engine-spec.md` section 8. | U |

## AC-UI — Interface

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-UI-01 | M | **Given** replay mode after login, **then** the Dispute Queue lists the four demo disputes sorted by time left with at least one `URGENT`. | E |
| AC-UI-02 | M | **Given** any page, **then** the ModeBanner shows data mode and submit mode. | E |
| AC-UI-03 | M | **Given** the Case Workspace for DS-001, **then** every draft statement shows citation chips and clicking one opens the source snippet with the JSON path. | E |
| AC-UI-04 | M | **Given** the approve modal, **then** it shows the exact outbound request, mode, and requires a checkbox before the confirm button enables. | E |
| AC-UI-05 | M | **Given** empty, loading and error states, **then** each is implemented (not framework defaults) on Queue, Case, Risk and Health. | M |
| AC-UI-06 | S | Lighthouse accessibility score ≥ 90 on `/disputes` and `/disputes/[id]` in replay mode. | M |
| AC-UI-07 | M | The UI is usable at 1280×720 and at 390 px width (no horizontal scroll on Queue and Case). | E |
| AC-UI-08 | S | Dark theme renders AG Grid and AG Studio without unreadable text. | M |
| AC-UI-09 | S | **Given** the Health dashboard, **then** it renders KPI row, two bar charts, the "Deadline runway" widget and the "Verifier ledger" widget from live DB data (detail in AC-STUDIO-*). | E |
| AC-UI-10 | M | **Given** the access code is wrong, **then** the login shows an error and no data route responds with data. | I, E |
| AC-UI-11 | M | AI-drafted text is labelled as AI-drafted until approved. | E |

## AC-API — Fastify service (`apps/api`)

Spec: `13-api-service-spec.md`. Starter tests exist in `apps/api/test/api.test.ts`.

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-API-01 | M | **Given** any error (validation, auth, not found, upstream, unexpected), **then** the body is `{ error: { code, message, requestId, details? } }` and unexpected errors reveal no stack or internal message. | U |
| AC-API-02 | M | **Given** a request with `x-request-id`, **then** it is echoed on the response and appears in the log line; without it one is generated. | U |
| AC-API-03 | M | **Given** `GET /api/health`, **then** it needs no session, reports mode, submit mode, job backend, database, LLM, last sync, last webhook, and contains no secret, key, id or URL. | U |
| AC-API-04 | M | **Given** no valid `ds_session` cookie, **when** any non-public route is called, **then** it returns 401; **given** the wrong access code, login returns 401 and sets no cookie; the access-code compare is timing-safe. | U |
| AC-API-05 | M | **Given** more than 10 login attempts a minute from one client, **then** the next gets 429 with `Retry-After`. | U |
| AC-API-06 | M | **Given** an invalid environment, **when** the service starts, **then** it exits with a message naming each bad variable and never printing a value; `DS_SUBMIT_MODE=live` without `DS_MODE=live`, `DS_MODE=live` without PayPal credentials or `DATABASE_URL`, an Ollama key without a model, and the Render backend without its key or slug are all refused. | U |
| AC-API-07 | M | **Given** `GET /api/openapi.json`, **then** it is valid OpenAPI 3 listing every route with its security scheme and the shared error body, and `pnpm openapi:check` fails CI if `docs/openapi.json` is stale. | U, CI |
| AC-API-08 | M | **Given** a cross-origin request from an origin other than `WEB_ORIGIN`, **then** no CORS allow header is returned; responses carry Helmet security headers. | U |
| AC-API-09 | M | **Given** the web app in production, **then** the browser reaches the API through the same-origin rewrite, the session cookie is first-party, and no secret appears in the web bundle (grep in CI) (S12). | M, CI |
| AC-API-10 | M | **Given** a graceful shutdown signal, **then** the server stops accepting requests and waits for the in-flight worker tick before exiting. | U |

## AC-LLM — Ollama Cloud

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-LLM-01 | M | **Given** a configured key, **then** every Ollama request sends `Authorization: Bearer <key>` to `<OLLAMA_HOST>/api/chat` with `stream:false`, and never sends a `format` parameter. | U |
| AC-LLM-02 | M | **Given** a timeout, 401/403, 429 or 5xx from Ollama, **then** the client raises a typed error (`LlmTimeoutError`, `LlmAuthError`, `LlmRateLimitError`, `LlmError`) and the Studio proxy maps them to 504, 502 `LLM_PROVIDER_AUTH`, 429 with `Retry-After`, and 502. | U |
| AC-LLM-03 | M | **Given** a model reply with prose around a JSON object, or a fenced block, **then** `extractJsonObject` returns the object; **given** no object, it returns an error that triggers the repair path. | U |
| AC-LLM-04 | M | **Given** no `OLLAMA_API_KEY`, **then** `/api/health` reports `llm: not_configured`, the Dispute analyst replies with an honest notice, and drafting uses templates (AC-EVID-02). | U, E |
| AC-LLM-05 | M | **Given** the key is set, **then** it never appears in any response, log line, error message, OpenAPI document or the web bundle. | U, CI |
| AC-LLM-06 | S | **Given** a live key (spike S9), **then** the chosen `LLM_MODEL` completes a drafter call and a tool-calling call, and the model name is recorded in `docs/decisions/`. | L |

## AC-DB — Supabase Postgres

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-DB-01 | M | **Given** `DATABASE_URL`, **then** migrations and the jobs queue run against the Supabase **session pooler or direct** connection; the docs and `.env.example` say never to use port 6543 for the app. | I, L |
| AC-DB-02 | M | **Given** the app connects, **then** it runs only standard Postgres (no Supabase Auth, Storage, Realtime or Data API), and the same migrations pass against `docker compose` Postgres. | I |
| AC-DB-03 | S | **Given** the Supabase project, **then** Row Level Security is enabled on every application table with no public policy, so the Data API cannot return case data (S11). | M |
| AC-DB-04 | M | **Given** the hosted demo, **then** a periodic job touches the database at least daily and `docs/demo-uptime.md` records that the project was not paused (free projects pause after low activity over 7 days ✅). | M |

## AC-STUDIO — AG Studio dashboard and Dispute analyst (Track A)

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-STUDIO-01 | S | **Given** replay data, **then** the Health dashboard renders in `view` mode from the four analytics sources (`disputes`, `evidence_items`, `statements`, `risk_flags`) with no PII fields. | E, I |
| AC-STUDIO-02 | S | **Given** the Deadline runway widget, **then** one mark per open dispute appears at its response deadline, overdue and under-24-hour marks differ by shape and text label as well as colour, and clicking a mark opens the case. | U (view component), E |
| AC-STUDIO-03 | S | **Given** the Verifier ledger widget, **then** its accepted, rejected and per-reason counts equal the counts computed directly from `statements`. | U |
| AC-STUDIO-04 | S | **Given** the app's design tokens, **then** the Studio theme is built from them and light and dark both render legibly (AC-UI-08). | M |
| AC-STUDIO-05 | S | **Given** the Dispute analyst, **then** its tool list is exactly `viewSchema`, `viewReport`, `viewPage`, `viewWidget`, `executeQuery` (asserted in a unit test), so it cannot edit the report or contact PayPal. | U |
| AC-STUDIO-06 | S | **Given** the proxy LLM adapter, **when** the API returns 401, 429, 5xx or the network fails, **then** `executeTurn` does not throw into Studio; `complete` resolves with status `failed` and a plain-language error; an aborted signal cancels the request. | U |
| AC-STUDIO-07 | S | **Given** a turn response with text and tool calls, **then** the adapter emits `TEXT_MESSAGE_START/CONTENT/END` and `TOOL_CALL_START/ARGS/END` events in order and `complete` matches. | U |
| AC-STUDIO-08 | S | **Given** the analyst answers a question about deadlines or money, **then** the number comes from an `executeQuery` result (checked in the recorded demo session), and no answer contains a win probability. | M, eval |

## AC-RENDER — Render Workflows (Track B)

Starter tests: `apps/workflows/test/tasks.test.ts`, `apps/api/test/api.test.ts` ("render job backend").

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-RENDER-01 | S | **Given** the workflow service, **then** one task exists per job kind plus `process_dispute`, named exactly as the kinds, each validating its payload with `@ds/jobs` before running. | U |
| AC-RENDER-02 | S | **Given** `process_dispute`, **then** it runs `collect_case` then `draft_case` as separate task runs and never calls submit. | U |
| AC-RENDER-03 | S | **Given** a task without a registered handler, **then** it fails with `JobNotImplementedError` rather than succeeding. | U |
| AC-RENDER-04 | S | **Given** `DS_JOB_BACKEND=render`, **then** enqueue calls `startTask("<slug>/<kind>")` with an idempotency key (event id when given, else a 5-minute bucket), the inline worker is off, and `/api/health` shows `jobBackend: render`. | U |
| AC-RENDER-05 | S | **Given** a redelivered webhook event, **then** no second task run is started. | I |
| AC-RENDER-06 | S | **Given** the hosted demo, **then** `render.yaml` is applied, a webhook or the 5-minute cron produces a visible `sync_disputes`/`process_dispute` run in the Render dashboard, and a screenshot is in `docs/img/` (S11). | L |

## AC-APIM — APIMatic (Track C)

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-APIM-01 | S | `docs/openapi.json` is generated from the running app and matches it (`openapi:check`). | CI |
| AC-APIM-02 | S | The OpenAPI document lints with no errors. | CI |
| AC-APIM-03 | S | `apps/web` calls the API only through `packages/api-client`. The client is generated by APIMatic if S13 allowed it; otherwise by `openapi-typescript`, and the README says which. | M, CI |
| AC-APIM-04 | S | `docs/decisions/apimatic.md` records how the Context Plugin was installed and which code it informed, or that it could not be installed (S13). | M |

## AC-AI — PayPal + AI evidence (Track D)

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-AI-01 | M | Model-derived text can reach PayPal only through `verifyDraft`; a code search finds no other path from `@ds/agent` output to a gateway write. | U, M |
| AC-AI-02 | M | `pnpm eval` prints a results table (cases, rejected, accepted) that the README embeds; it runs without a model for the deterministic suite. | CI |
| AC-AI-03 | S | The Case Copilot exposes only read tools and every tool result is stored in `raw_payloads` and cited. | U |
| AC-AI-04 | M | With `OLLAMA_API_KEY` unset, the full DS-001 flow still completes in replay mode (template or recorded draft). | E |
| AC-AI-05 | M | The video and Devpost text show where AI is used and where it is blocked (verifier rejections, approval gate). | M |

## AC-DEMO — Judge experience

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-DEMO-01 | M | **Given** a fresh clone, **when** a judge follows the README quickstart in replay mode, **then** the app runs with five commands or fewer and no PayPal or LLM credentials, and the demo disputes appear. | M (second machine) |
| AC-DEMO-02 | M | **Given** the hosted URL and the access code in the Devpost testing instructions, **then** a judge can complete the DS-001 flow to a dry-run submission in under 90 seconds without reading documentation. | M |
| AC-DEMO-03 | M | **Given** no LLM key in the hosted demo, **then** a pre-generated model draft (stored fixture) is shown for DS-001 with the label "recorded model output". | E |
| AC-DEMO-04 | M | **Given** the hosted demo, **then** it stays reachable from 11 Nov through 15 Dec (uptime check at least daily, recorded in `docs/demo-uptime.md`). | M |
| AC-DEMO-05 | M | **Given** the repo, **then** the licence is OSI-approved, detected by GitHub, and the repo is public. | M |

## AC-SUBMIT — Hackathon submission

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-SUBMIT-01 | M | The video is public on YouTube, under 3:00, plays logged out, shows the product working, and uses no third-party trademarks or copyrighted music beyond what the rules allow ✅ (rules; re-read before recording). | M |
| AC-SUBMIT-02 | M | The Devpost text describes the problem, named user, what was built, how PayPal APIs and AI are used, how AG Grid / AG Studio, Render and APIMatic are used (only what the build really uses), and limits. | M |
| AC-SUBMIT-03 | M | The submission lists the repo link, demo link, test instructions with the access code, and "built with" tags. | M |
| AC-SUBMIT-04 | M | The form selection matches the rules ✅: at most one Grand Prize or Honorable Mention plus one sponsor prize can be won. Sponsor prizes are open to submissions that use that sponsor's tools, so the Devpost text names every sponsor tool actually used, and `14-prize-tracks.md` records which one is the primary target. | M |
| AC-SUBMIT-05 | M | Final submit is completed by Wed 11 Nov 12:00 IST and verified from a private browser window. | M |
| AC-SUBMIT-06 | M | AG Studio trial was started on or after 1 Nov so it covers 1–15 Dec; the start date is recorded in `docs/decisions/`. | M |

## AC-NFR — Non-functional

| ID | P | Criterion | By |
| --- | --- | --- | --- |
| AC-NFR-01 | M | No secrets in git history or logs; secret scanning passes in CI. | CI |
| AC-NFR-02 | M | `pnpm turbo run lint typecheck test` passes on a clean checkout without network access to PayPal or an LLM. | CI |
| AC-NFR-03 | M | Queue page server response (replay mode, 50 disputes) renders in under 1.5 s on a laptop. | M |
| AC-NFR-04 | M | Logs are structured and contain `requestId`, `jobId` and `disputeId` where relevant, and never tokens or full payloads (log scrubbing test). | U |
| AC-NFR-05 | M | Every route validates input with zod and returns typed errors; no unhandled promise rejections in e2e. | I, E |
| AC-NFR-06 | M | Unit-test coverage ≥ 90% lines for `packages/core`, with every verifier rule covered by a named test. | CI |
| AC-NFR-07 | M | Migrations apply from empty and from the previous release; `pnpm seed:demo` is idempotent. | I |
| AC-NFR-08 | S | `audit_log` rejects UPDATE and DELETE for the application role. | I |
| AC-NFR-09 | M | The app never calls a PayPal write endpoint when `DS_SUBMIT_MODE=dry-run` (guard test with a gateway spy). | I |

## Traceability to judging criteria

| Hackathon criterion (equally weighted ✅) | What it asks (shortened from the rules) | Main ACs that demonstrate it |
| --- | --- | --- |
| Technological Implementation (also the first tie-breaker ✅) | Thorough, skilful use of the PayPal platform and AI; genuine, working, non-trivial implementation | AC-VER-*, AC-SYNC-*, AC-WH-*, AC-SUB-03, AC-SUB-07, AC-NFR-* |
| Design | Complete, coherent product experience, not a proof of concept | AC-UI-*, AC-DEMO-02 |
| Potential Impact | Credible, specific case for a real problem for a real audience, and the solution addresses it as demonstrated | AC-DEC-*, AC-CASE-*, AC-RISK-* |
| Innovation/Idea | Creative, novel, differs from existing concepts | AC-VER-11, AC-VER-10 (AI with enforced accountability), AC-RISK-* (prevent plus respond) |
| Presentation | Video shows the project working end to end; clear problem, audience, why it matters | AC-SUBMIT-01…03, AC-DEMO-02 |

Sponsor and category tracks (`14-prize-tracks.md`; sponsor criteria beyond "use the tools" are ❓ unless stated there):

| Track | Main ACs |
| --- | --- |
| Best Use of AG Grid | AC-STUDIO-*, AC-UI-09 |
| Best Use of Render | AC-RENDER-* |
| Best Use of APIMatic | AC-APIM-*, AC-API-07 |
| Best Use of PayPal + AI | AC-AI-*, AC-VER-*, AC-SUB-* |

The rules also say judges are not required to run the project and may judge from the text, images and video alone ✅, and that judging may include automated AI-driven analysis ✅. The video, the Devpost text and the README therefore carry real weight.
