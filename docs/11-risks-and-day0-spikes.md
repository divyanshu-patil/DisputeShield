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

### S9 — Agent toolkit read tools (≈1 ih)

Install `@paypal/agent-toolkit`; check the peer dependency on the AI SDK; find a combination that compiles. Run a `generateText` call with read-only tools (`disputes.list/get`, `shipment.show`, `orders.get`) against the sandbox. Pass: the model calls a tool and returns a grounded answer. Updates: contract section 7 (Q7); pin versions in `packages/agent`. Fail → drop Case Copilot (Should), no other impact.

### S10 — AG Studio in Next 16 (≈1.5 ih)

1. Clone PayPal's starter (`paypaldev/hackathon-paypal-ag-grid-boilerplate`) or add `ag-studio`/`ag-studio-react` 3.0.0 to `apps/web`.
2. Render `<AgStudio data={{sources:[…]}} mode="edit" />` inside Next 16 with `transpilePackages`.
3. Find: licence mechanism and trial start (do **not** start the trial before 1 Nov; read how it is activated and whether rendering needs a key ❓), theming API, custom widget API ❓, whether it needs `"use client"`, bundle size, dark mode.
4. Prototype one custom widget ("Deadline runway") or confirm what extension points exist.
Pass: dashboard renders with sample data and one custom widget is feasible.
Fail → fallback dashboard (AG Grid + simple charts); sponsor prize still reachable through AG Grid use.
Updates: `06-ui-spec.md` section 6, contract Q8.

## 2. Spike order and time boxes

| Order | Spike | Box |
| --- | --- | --- |
| 1 | S0 | 1 h; stop and escalate if blocked |
| 2 | S1 | 3 h max |
| 3 | S2 | 1 h |
| 4 | S3, S4 | 3 h |
| 5 | S5 | 2 h |
| 6 | S6, S7, S8 | 4 h |
| 7 | S9, S10 | 3 h (can slip into Phase 1) |

Total box ≈ 17 h; the plan assumes ≈ 12 ih because some will be quick. Write results in `docs/decisions/0001-day0-spike-results.md` using this template:

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
| R6 | LLM provider outage or key missing on judge machines | M | M | n/a | template fallback; recorded draft in replay mode | Phase 2 |
| R7 | AG Studio licence/trial/API surprises | M | M | S10 | start trial 1 Nov; fallback dashboard; AG Grid still qualifies | Phase 3 |
| R8 | AG Studio trial expires inside judging window | M | H | calendar | start on or after 1 Nov (45 days → ~16 Dec) ✅; record date | Phase 3 |
| R9 | Hosted demo or free DB expires before 15 Dec | M | H | provider terms ❓ | check retention at deploy time; paid tier or always-on; daily uptime check | Phase 4 |
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

Listed so nobody builds on them silently: win rates and dispute volumes for small sellers; the exact `dispute_state` values; whether the accepted carriers list is enumerated; nested order paths; whether sandbox allows partial refunds on all payment types; AG Studio custom widget API; AG Studio licence variable; hosting provider retention terms; eligibility details for the entrant.
