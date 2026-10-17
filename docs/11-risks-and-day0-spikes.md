# 11. Risks and Day-0 spikes

Spikes run Sat 17 – Mon 19 Oct (IST) and decide whether the plan survives (`07-implementation-plan.md` section 1). Each spike has an exact goal, steps, a pass condition, what to record, and what changes if it fails. All spike code lives in `apps/cli/src/commands/spike.ts` (`pnpm ds spike <id>`) or in `packages/paypal/src/sandbox-only/`, and every successful response is passed through the redactor and saved as a fixture.

Rule: **do not build features that depend on an unverified call until its spike has passed.**

## 1. Spike list

### S0 — Accounts and app (≈1 ih)

Goal: working sandbox business account, buyer account and a REST app with the features we need.

Steps:
1. Sign up for a PayPal developer account. Record whether India signup works and any prompts. If blocked, ask on the hackathon Discord and the PayPal developer community, and write down the answer ❓.
2. In the Developer Dashboard (sandbox): create or use the default Business account (seller) and a Personal account (buyer). Make sure both have funds/cards as sandbox defaults allow.
3. Create a REST app under the business account. Enable: **Transaction search**; dispute-related features if a toggle exists ❓ (names to record). Copy client ID and secret into `.env`.
4. `ds spike s0`: requests a token, prints scopes returned and expiry (never prints the secret or token).

Pass: token obtained; scopes listed; features recorded. Record: sandbox base URL used, token scopes, feature names.
Fail → no work possible; resolve before anything else (support ticket, Discord). If unresolved by Mon 19 Oct, fall back.

### S1 — Create a sandbox dispute (≈2 ih) — highest risk

Goal: have at least three disputes in the seller account in different states for fixtures and demo.

Route A (API) ✅ documented: `POST /v1/customer/disputes` with a buyer `PayPal-Auth-Assertion` JWT. Needs the buyer scopes `DISPUTE_CREATE` / `UPDATE_BUYER`, which PayPal's account manager must add to the app. Try; if you get a permission error, record the exact response (redacted) and ask in Discord for scope enablement.

Route B (UI) ✅ documented:
1. In the sandbox, log in as the buyer and pay the business account **by credit card** (not by PayPal balance); use a sandbox card.
2. Wait a few minutes.
3. As the buyer, open the transaction and open a dispute (reason item not received).
4. Only one dispute per transaction; create one payment per scenario.
5. Use amounts that make Accelerated Response behave if that matters ❓ (amount rules not recorded).

Pass: `GET /v1/customer/disputes` as the seller returns the dispute.
Fail → if neither route works, the project cannot read real disputes. Options: (1) proceed with **fixtures built from PayPal's documented example payloads** and be honest in the submission (high risk for Technological Implementation); (2) switch to the fallback idea. Decide by Mon 19 Oct.

### S2 — Read list and details (≈1 ih)

Steps: `ds spike s2` calls list (with `update_time_after`) and details for each dispute. Save raw JSON.
Record: field names for amounts, transaction IDs, reason strings (is it `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`?), `dispute_state` values, `allowed_response_options`, `links` (which rels appear in each state), `seller_response_due_date` presence, `messages` shape.
Pass: details parse against a first draft of `@ds/schemas/paypal/dispute-details.ts`.
Updates: `03-paypal-api-contract.md` sections 2.1, 2.2, Q10.

### S3 — Require evidence, then provide evidence (≈2 ih)

Goal: successfully attach evidence to a dispute in the sandbox.

Steps:
1. Move the dispute to a state where the seller can provide evidence. Per the docs, `require-evidence` with `{"action":"SELLER_EVIDENCE"}` needs the dispute `UNDER_REVIEW` ✅. If the dispute is already `WAITING_FOR_SELLER_RESPONSE`, skip this.
2. Check the dispute's `links` for `provide-evidence`.
3. Send the multipart request in form **A** (JSON part `input` + document parts) per the integration guide. If it fails with a validation error, try form **B** (single binary field `evidence-file` per the schema). Try with and without a small PNG.
4. Try `carrier_name` values: a named carrier and `OTHER`.
5. Record the request headers (content type with boundary) and the accepted shape; save redacted request and response.

Pass: 2xx response and the evidence appears in `evidences` on a re-fetch.
Fail → if both forms fail, record the errors with `debug_id`s, post in PayPal developer community, and use **dry-run mode as the primary submit mode** (acceptance criterion AC-SUB-03 becomes "not verified live").
Updates: contract 2.3 (Q2, Q3), `multipart.ts`.

### S4 — Accept claim (≈0.5 ih)

On a second dispute: `POST …/accept-claim` with `accept_claim_type: "REFUND"` and a note. Record any required `accept_claim_reason` ❓. Pass: 2xx and dispute resolves. Updates: contract 2.4 (Q5).

### S5 — Webhooks (≈1.5 ih)

Steps:
1. Run the app (or a tiny echo server) and a tunnel (for example cloudflared or ngrok; a free tunnel is enough).
2. Developer Dashboard: add a webhook with the three dispute events; record the webhook ID.
3. Trigger events (create/update a dispute or use the webhook simulator). Capture headers and raw body exactly.
4. Call `POST /v1/notifications/verify-webhook-signature` with the captured data and webhook ID. Also try with a real event (not simulator) ✅ postback does not verify simulator events ⚠️.
5. Record the HTTP code PayPal returns for a deliberately bad signature (Q9) and timing of delivery after the action.

Pass: a real event verifies with `SUCCESS`.
Fail → polling-only; the "real-time" claim is dropped (G4 optional).
Updates: contract section 3.

### S6 — Transaction search (≈1 ih)

`GET /v1/reporting/transactions` with `fields=transaction_info,payer_info,shipping_info,cart_info` over the last 30 days. Record: availability delay, presence and meaning of `protection_eligibility`, `paypal_reference_id` (ODR), `shipping_info.address` fields, `cart_info` items shape, paging.
Pass: transactions appear with the fields we need.
Fail on shipping/cart → Prevent rules `R-ADDR` degrade to CSV-only; note it.
Updates: contract section 4, `transactions` columns.

### S7 — Order details (≈1 ih)

Take the order ID from `paypal_reference_id` and `GET /v2/checkout/orders/{id}`. Save the response. Record exact paths for capture ID, refunds, shipping address, trackers. (Open item Q4.)
Pass: the capture ID and shipping address are found; trackers visible after S8.
Updates: contract section 5, `extract-order.ts` spec.

### S8 — Add tracking and refund (≈1 ih)

1. `POST /v2/checkout/orders/{id}/track` ⚠️ with `capture_id`, `tracking_number`, `carrier`, `notify_payer: false`. Re-fetch the order and confirm the tracker appears. Try the toolkit's `create_shipment_tracking` as an alternative.
2. Refund: `POST /v2/payments/captures/{capture_id}/refund` ⚠️ with a `PayPal-Request-Id`. Repeat with the same ID to see idempotent behaviour.
Pass: tracker visible; refund created; repeat does not double refund.
Fail → `ADD_TRACKING` and/or `REFUND` become dry-run only; record the error.
Updates: contract section 6 (Q6).

### S9 — Ollama Cloud and the agent toolkit (≈2 ih)

Part 1, Ollama Cloud (needs your account and API key; keep the key out of git):
1. `GET https://ollama.com/api/tags` with `Authorization: Bearer $OLLAMA_API_KEY`. Record which models your plan can call ❓ (free-tier API access is not stated in the docs read).
2. For each candidate model, run the drafter prompt (`packages/agent`) against DS-001 facts 5 times. Record: JSON parse rate, zod-valid rate, verifier acceptance before and after repair, latency. Cloud has no structured outputs ✅, so parse rate is the number that matters.
3. Send one request with `tools` and confirm the model returns `tool_calls`; send the tool result back as a `tool` message with `tool_name` ⚠️ and confirm a final answer.
4. Two parallel requests on the free tier: confirm the 429 behaviour and the `Retry-After` value if any.
Pass: one model has parse rate ≥ 95%, supports tool calls, and answers within 30 s. Write the choice into `docs/decisions/` and set `LLM_MODEL`.
Fail → keep templates as the draft path and the recorded model draft in replay (AC-DEMO-03); the Dispute analyst is shown against a recorded session; Case Copilot is dropped.
Updates: `.env.example`, `13-api-service-spec.md` section 7, AC-LLM-06.

Part 2, toolkit (≈1 ih): install `@paypal/agent-toolkit`; its documented example uses the Vercel AI SDK `generateText` with `maxSteps` ✅, which this build does not use. Call the toolkit's read tools (`disputes.list/get`, `shipment.show`, `orders.get`) directly against the sandbox, and wrap them as Ollama `tools`. Pass: a grounded answer using a toolkit read tool. Fail → drop Case Copilot (Should); no other impact. Updates: contract section 7 (Q7), pin versions in `packages/agent`.

### S10 — AG Studio: custom widgets, theme, agent adapter (≈3 ih)

1. Clone PayPal's starter (`paypaldev/hackathon-paypal-ag-grid-boilerplate`) or add `ag-studio`/`ag-studio-react` 3.0.0 to `apps/web`.
2. Render `<AgStudio data={...} mode="edit" />` inside Next 16 with `transpilePackages`.
3. Find: licence mechanism and trial start (do **not** start the trial before 1 Nov; read how it is activated and whether rendering needs a key ❓), whether it needs `"use client"`, bundle size, dark mode.
4. **Custom widget:** register "Deadline runway" through `createWidgets({ additionalTypes })` with a custom `AgRegistry` type and a `comp` key mapped by the `components` prop. Read data through `widgetApi.getData`. Time box 2 ih; if it fails keep a standard widget and record why.
5. **Agent:** wire `createAiHarness` + `directLlmRunner` with the proxy `AgLlmAdapter` from `14-prize-tracks.md` section 2.6 against `POST /api/studio/llm/turn` in replay mode (no model). Confirm: the chat panel opens, prompt starters show, a turn shows the honest "no model" notice, a failed response (`status: "failed"`) is visible to the user and does not break the panel ❓.
6. Theme: build from tokens with `createStudioTheme` / `studioGridTheme`.
Pass: dashboard renders with sample data; one custom widget works; the analyst round-trips a turn.
Fail → fallback dashboard (AG Grid + simple charts and the standard Studio widgets); sponsor prize still reachable through AG Grid use.
Updates: `06-ui-spec.md` section 6, `14-prize-tracks.md` section 2, contract Q8.

### S11 — Render and Supabase deploy (≈3 ih)

1. Supabase: create a project; take the **session pooler** URL (port 5432, user `postgres.<ref>`) and the direct URL; run migrations; run the job-claim concurrency test through the session pooler, then confirm it fails or misbehaves on port 6543 (to prove the rule). Confirm Render can reach the DB (IPv4 via the pooler; direct needs IPv6 ❓). Enable RLS on all tables; confirm the anon key cannot read them.
2. Render: apply `render.yaml` (web + `type: workflow` + cron) from the repo. Fix whatever the Blueprint validator rejects; record it. Set secrets in the dashboard. Confirm `/api/health` is green.
3. Workflows: locally run `render workflows dev -- tsx src/index.ts`, then deploy; start `sync_disputes` from `apps/api` with `DS_JOB_BACKEND=render` and from the cron job; confirm a run appears. Confirm whether a free/hackathon account can create workflows ❓ and what they cost.
4. Send a sandbox webhook to the Render URL after 20 minutes idle (cold start) and confirm it is processed.
Pass: the pipeline runs on Render against Supabase; screenshot saved. Fail → `DS_JOB_BACKEND=postgres` on a single Render web service, record why, drop Track B.
Updates: `render.yaml`, `architecture.md` section 14, AC-RENDER-06, AC-DB-01, AC-DB-03.

### S12 — Browser to API session (≈1 ih)

Deploy web and API on their real hosts. Try the same-origin rewrite: log in, load the queue, send a 40 to 60 s Studio turn (stub with a delay). Check cookie flags in the browser. Check Safari with "prevent cross-site tracking" on. If the rewrite times out or the cookie fails, implement the bearer-token fallback (`architecture.md` section 11). Pass: login and a long turn work in Chrome, Firefox and Safari. Updates: ADR-015, AC-API-09.

### S13 — APIMatic (≈2 ih)

Find the Context Plugin install steps (the resource page was not readable ❓). Install it into your coding agent; ask it for the PayPal Orders v2 "add tracking" call and compare against the contract. Upload `docs/openapi.json` to APIMatic; generate a TypeScript SDK and a docs portal; check the SDK compiles against our types. Record every step and what it cost in `docs/decisions/apimatic.md`. Pass: SDK generated and used by `apps/web`. Fail → `openapi-typescript` client; do not claim APIMatic. Updates: `14-prize-tracks.md` section 4, AC-APIM-*.

## 2. Spike order and time boxes

| Order | Spike | Box |
| --- | --- | --- |
| 1 | S0 | 1 h; stop and escalate if blocked |
| 2 | S1 | 3 h max |
| 3 | S2 | 1 h |
| 4 | S3, S4 | 3 h |
| 5 | S5 | 2 h |
| 6 | S6, S7, S8 | 4 h |
| 7 | S9 | 3 h (key and model choice; can slip into Phase 1) |
| 8 | S10, S11, S12, S13 | 9 h total; **run after the Phase 0 go/no-go**, in Phase 1 (S11, S12 once something is deployable) and Phase 3 (S10 after 1 Nov for the trial; start with a licence-free render check before then) |

Phase 0 (S0 to S9) box ≈ 17 h; the plan assumes ≈ 12 ih because some will be quick. S10 to S13 are scheduled in later phases (`07-implementation-plan.md`). Write results in `docs/decisions/0001-day0-spike-results.md` using this template:

```text
Spike: S3  Date: 2026-10-18  Result: PASS | PARTIAL | FAIL
What I ran: …
What happened (redacted request/response ids): …
Contract changes: …
Plan changes: …
```

## 3. Risk register

Likelihood and impact are the author's judgement (L/M/H), not measured.

| # | Risk | L | I | Early signal | Mitigation | Owner/When |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Sandbox dispute creation unavailable (scopes not granted, India signup issues) | M | H | S0/S1 fail | UI route B; Discord/support request on day 1; fixtures from real captures; fallback idea | Day 0 |
| R2 | `provide-evidence` multipart quirks block live submit | M | M | S3 fails | try both forms; dry-run primary; show recorded request | Day 0 |
| R3 | Webhooks late, duplicate, out of order, or not verifying | M | M | S5 | idempotent insert, re-fetch before acting, polling backup | Phase 1 |
| R4 | Transaction Search lags up to 3 h ✅ | H | L | S6 | label data age; never claim real-time Prevent | Phase 3 |
| R5 | LLM hallucination slips through | L | H | evals | verifier + adversarial evals gate CI; fallback template | Phase 2 |
| R6 | Ollama Cloud outage, key missing, no API access on the free plan ❓, or 1-concurrent-request limit ✅ | M | M | S9 | template fallback; recorded draft in replay mode; serialise Studio turns and return 429 with Retry-After; local Ollama via `OLLAMA_HOST` | Phase 2 |
| R7 | AG Studio licence/trial/API surprises | M | M | S10 | start trial 1 Nov; fallback dashboard; AG Grid still qualifies | Phase 3 |
| R8 | AG Studio trial expires inside judging window | M | H | calendar | start on or after 1 Nov (45 days → ~16 Dec) ✅; record date | Phase 3 |
| R9 | Hosted demo or free DB unavailable before 15 Dec: Supabase free projects pause after low activity over 7 days ✅; Render free web services sleep after 15 min ✅ | M | H | provider terms | 5-minute cron keeps the DB active; paid Render instance via the $50 credits for Dec 1 to 15; daily uptime check; recorded video as the fallback | Phase 4 |
| R10 | Sandbox flakiness on recording day | M | M | rehearsals | record in replay; label honestly | Phase 5 |
| R11 | Scope creep (copilot, PDF, offers) | H | M | hours burned > plan | MoSCoW; cut Should items at checkpoints | all |
| R12 | Unverified PayPal fields used in code | M | M | ❓ in contract | rule: check contract first; fixtures must parse; spike before feature | all |
| R13 | Rules compliance: trademarks in video, missing licence, multiple sponsor prizes, wrong deadline | L | H | checklist | `10-demo-and-submission.md` checklist; re-read rules on 10 Nov | Phase 5 |
| R14 | Eligibility (country, age, team structure) not confirmed | L | H | not verified in this pack ❓ | read the Eligibility section of the official rules on day 1 and record the result | Day 0 |
| R15 | Another team builds a similar dispute tool | M | M | search | differentiate on verifier + Prevent + open-source; do a fresh Devpost search before recording; do not claim "no rival" without a trail | Phase 4 |
| R16 | Secrets leak (client secret, webhook ID, LLM key) | L | H | gitleaks | env only, CI scan, redaction tests | all |
| R17 | Personal data in fixtures or logs | L | H | review | redact; human read before commit; synthetic data only | all |
| R18 | PayPal rate limits or abuse detection in sandbox | L | L | 429 | backoff; modest polling (every 5 min) | Phase 1 |
| R19 | Time: solo builder, unknown daily hours | H | H | checkpoint slippage | checkpoints in plan; cut list; keep buffer 37 h | all |
| R20 | Judges do not run the code; only video counts | M | H | n/a ✅ rule | video is a deliverable with its own phase; strong images and text | Phase 5 |
| R21 | Pre-existing code claims: "significantly updated" rule | L | M | n/a | build from scratch; say so; commit history shows it | all |
| R22 | PayPal docs change or conflict (multipart, webhook code) | M | L | spikes | record conflicts in contract; trust sandbox behaviour over docs | all |
| R23 | Financial/preferential support rule (commercial licence from sponsor) | L | M | n/a | use only trials offered by the hackathon; note in README | Phase 3 |
| R24 | Render Workflows unavailable, different from the SDK docs, or costs credits quickly | M | M | S11 | `DS_JOB_BACKEND=postgres` works without it; Track B is optional | Phase 3 |
| R25 | Cookie not sent from the browser to the API (cross-site, `SameSite=Lax`) | H | H | S12 | same-origin rewrite; bearer-token fallback; test in Safari | Phase 1 |
| R26 | Supabase transaction pooler (6543) breaks `SKIP LOCKED` queue or prepared statements | M | H | S11 | use session pooler or direct; documented in `.env.example`; concurrency test | Phase 1 |
| R27 | Cloud model returns non-JSON or ignores tool schemas | M | M | S9 parse rate | extract + zod + one repair + template; evals measure parse rate | Phase 2 |
| R28 | Custom Studio widget typing or registration blocks the dashboard | M | M | S10 | one widget only; standard widgets; AG Grid prize still reachable | Phase 3 |
| R29 | Studio chat prompt-injected into doing harm | L | H | tests | read-only tool allow-list (AC-STUDIO-05); no PayPal tool | Phase 3 |
| R30 | APIMatic tooling not accessible or install steps unclear ❓ | M | L | S13 | fallback client generator; do not claim APIMatic | Phase 3 |
| R31 | Sponsor prize criteria differ from what we assume ❓ | M | M | n/a | read the sponsor pages again on 1 Nov; claim only used tools; remember only one sponsor prize can be won | Phase 3 |

## 4. Go / no-go record (fill on Mon 19 Oct)

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 account and token | | |
| G2 real dispute readable | | |
| G3 provide-evidence live or dry-run only | | |
| G4 webhook verified | | |
| G5 transaction search fields | | |
| Decision | PROCEED / PROCEED WITH CUTS / FALLBACK | |

If FALLBACK: open `docs/decisions/0002-fallback.md`, summarise why, and restart with the ideation document's next idea; this pack's `packages/core` and `packages/db` patterns (jobs, audit, replay gateway) are reusable.

## 5. Things we deliberately do not know yet

Listed so nobody builds on them silently: win rates and dispute volumes for small sellers; the exact `dispute_state` values; whether the accepted carriers list is enumerated; nested order paths; whether sandbox allows partial refunds on all payment types; AG Studio custom widget behaviour and licence variable; whether Ollama's free tier allows API calls and which models support tools; whether a hackathon Render account can run Workflows; the APIMatic Context Plugin install steps; hosting provider retention terms; eligibility details for the entrant.
