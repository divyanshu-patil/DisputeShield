# 07. Implementation plan

Dates are in IST (UTC+05:30). Hackathon submission deadline: **12 Nov 2026, 12:00 pm PST = 13 Nov 2026, 01:30 IST** ✅ (Devpost rules). The plan targets **submitting by 11 Nov around 12:00 IST** so there is about 37 hours of buffer for upload problems, a failed video render or a sandbox outage.

Today is Sat 17 Oct 2026. That leaves 26 days to the target and 27 to the deadline.

Team size and hours per day are unknown, so estimates are in **ideal hours (ih)** for one competent full-stack developer working with a coding agent. Multiply by your own factor.

**Totals (author's estimate, not measured):** the full plan with the four prize tracks is about **165 ih**; the Must-only path (no Prevent, no Studio dashboard, no tracks) is about **120 ih**. If your available time is under 165 ih, follow the cut order in `14-prize-tracks.md` section 6 and section 8 below; if it is under 120 ih, stop and reduce the Must list too.

**Starter code already in this pack** (verified offline on 2026-10-17, see `13-api-service-spec.md` section 0): `apps/api` (Fastify, in-memory adapters), `apps/workflows` (Render tasks, no handlers), `packages/schemas` (Studio wire types), `packages/agent` (Ollama client, Studio translation), `packages/jobs` (job kinds and runner), `render.yaml`. Tasks below say "replace the in-memory adapter" where they build on it. Nothing in the starter has been run against PayPal, Supabase or Render.

## 0. Ground rules

1. **Spikes before features.** Phase 0 exists to find out whether the PayPal sandbox lets us do the core loop. If it does not, we switch plans on 19 Oct instead of 5 Nov.
2. **Vertical slice early.** By end of Phase 1 one fixture dispute goes from webhook to a screen. By end of Phase 2 it goes all the way to a dry-run submission.
3. **Replay first, live second.** Everything works in replay mode before live mode is wired; live mode only needs to be proven for the demo path.
4. **Feature freeze on Sun 8 Nov.** After that: bugs, tests, docs, deploy, video.
5. **Judging window is 1–15 Dec** ✅. The hosted demo and its database must stay up through 15 Dec (see risks).
6. **Do only what is asked.** New ideas go to the backlog section of this file, not into the sprint.

## 1. Go / no-go gate (end of Phase 0, Mon 19 Oct)

Dispute Shield proceeds only if these are true. Otherwise switch to the fallback.

| Gate | Needed | Why |
| --- | --- | --- |
| G1 | Sandbox business account and REST app exist, token works (S0) | nothing works without it |
| G2 | At least one sandbox dispute exists in the seller's account and `GET /v1/customer/disputes/{id}` returns it (S1/S2) | core data source |
| G3 | Either `provide-evidence` succeeds in the sandbox, or we have a documented, working dry-run path plus recorded real responses (S3) | submit step; dry-run is acceptable if live is impossible |
| G4 | A webhook reaches our endpoint and verifies (S5) | otherwise polling-only is acceptable but the "real-time" story weakens |
| G5 | Transaction Search returns `shipping_info` and `protection_eligibility` for sandbox transactions (S6) | Prevent module |

Pass rule: G1 and G2 mandatory; G3 satisfied by live or dry-run; G4 and G5 optional but each failure removes a Should item.

**Fallback:** "Contract-to-Cash" from the ideation document (or the next-ranked idea that does not need dispute data). Decide on Mon 19 Oct by evening IST; do not sink more than 12 ih before the decision.

## 2. Phase 0 — Spikes and set-up (Sat 17 – Mon 19 Oct, ~13 ih)

Detailed spike scripts and success criteria: `11-risks-and-day0-spikes.md`.

| ID | Task | Output | ih |
| --- | --- | --- | --- |
| P0-1 | Create repo from this pack: Turborepo skeleton (`02-monorepo-structure.md`), copy the starter packages, run their tests, CI green, licence file | repo + CI | 2.5 |
| P0-2 | S0: developer account, sandbox business + buyer accounts, REST app, features enabled | `.env` working | 1 |
| P0-3 | S1: create dispute (API if scopes, else UI route) | one real sandbox dispute | 2 |
| P0-4 | S2: fetch list and details, save raw JSON | first fixtures | 1 |
| P0-5 | S3/S4: require-evidence then provide-evidence; accept-claim on a second dispute | contract Q2, Q3, Q5 answered | 2 |
| P0-6 | S5: tunnel + webhook registration + signature verification | contract Q9 | 1.5 |
| P0-7 | S6/S7/S8: Transaction Search, order details, add tracking | contract Q4, Q6 | 2 |
| P0-8 | S9: Ollama Cloud key, model choice (parse rate, tools, latency), toolkit read call | `LLM_MODEL`, contract Q7 | 2 (can finish in Phase 1) |
| P0-10 | Accounts: Supabase project, Ollama Cloud key, Render account (and hackathon credit), APIMatic access; write names (not values) into `.env.example` | accounts ready | 1 |
| P0-9 | Update `03-paypal-api-contract.md`; record go/no-go | decision note in `docs/decisions/` | 0.5 |

S10 (AG Studio), S11 (Render and Supabase), S12 (browser to API session) and S13 (APIMatic) are **not** Phase 0: they run in Phases 1 and 3 (`11-risks-and-day0-spikes.md`). Phase 0 total is about 13.5 ih.

## 3. Phase 1 — Foundations (Tue 20 – Sun 25 Oct, ~34 ih)

Goal: a fixture dispute travels from stored webhook to a visible queue row.

| ID | Task | Package | Depends | ih |
| --- | --- | --- | --- | --- |
| P1-0 | Adopt the starter: wire `apps/api`, `apps/workflows`, `packages/jobs|schemas|agent` into the workspace with the shared configs; `turbo run lint typecheck test` green; `/api/health` and `/api/openapi.json` respond in replay | api, workflows, jobs, schemas, agent | P0-1 | 1 |
| P1-1 | Shared configs (TS, ESLint with boundary rules incl. `apps/web` must not import server packages), Vitest setup | config-* | P0-1 | 2 |
| P1-2 | Zod schemas: facts, drafts, dispute, transaction, order, fulfilment, risk, api DTOs, PayPal payload subsets | schemas | P1-1 | 3 |
| P1-3 | Drizzle schema + first migration + repos + docker-compose + test helper; connection via `DATABASE_URL` (Supabase session pooler or direct), RLS enabled, `prepare` settings documented | db | P1-2 | 4 |
| P1-4 | `PostgresJobQueue` implementing the `JobQueue` port (`enqueue` with dedupe key, `claim` with SKIP LOCKED, backoff, reaper) driving `@ds/jobs` `createJobRunner` + tests | db, jobs | P1-3 | 3 |
| P1-5 | Gateway interface, errors, LiveGateway (auth, list, get), recorder + redactor | paypal | P1-2, P0-4 | 4 |
| P1-6 | ReplayGateway + scenario registry + first fixtures (DS-001, DS-002) | paypal, fixtures | P1-5 | 3 |
| P1-7 | Webhook: replace the memory `EventStore`/`WebhookVerifier` in `apps/api` with `@ds/db` and `@ds/paypal` (postback verify); keep the route contract; `ds webhook-simulate` | api, paypal, db, cli | P1-4, P1-5 | 3 |
| P1-8 | `sync_disputes` / `sync_dispute` handlers (registered for both backends); `/api/cron/tick` and the inline worker over the Postgres queue; replace the memory `DisputeReader` | api, db, paypal | P1-4 | 2 |
| P1-9 | App shell: login against `/api/auth/login`, same-origin rewrite `/api/* → API_ORIGIN`, typed API client, layout, ModeBanner, tokens, empty states | web, ui | P1-1 | 3 |
| P1-10 | Queue page with AG Grid reading `GET /api/disputes` | web, ui | P1-8, P1-9 | 3 |
| P1-11 | Real `HealthProbe` (database, last sync) in `/api/health`; Setup page v0 | api, web | P1-8 | 1 |
| P1-12 | **Deploy skeleton (spikes S11, S12):** Supabase project, Render web service for the API, web host, login works across the rewrite, `render.yaml` applied, cold-start webhook test. Decide Track B go/no-go | api, workflows | P1-9, P1-11 | 3 |
| P1-13 | OpenAPI: `pnpm openapi:export`, `openapi:check` in CI, lint the document (Track C groundwork) | api | P1-0 | 2 |

**Exit criteria (Sun 25 Oct):** CI green; `docker compose up` + `pnpm seed:demo` + `pnpm dev` (web and api) shows DS-001 and DS-002 in the queue; webhook simulator creates a `paypal_events` row and a sync job that runs; AC-WH-01…04, AC-SYNC-01…02, AC-API-01…08 pass; the API is deployed on Render against Supabase and the browser session works (AC-API-09) or the fallback is chosen; Track B go/no-go recorded.

## 4. Phase 2 — Respond core (Mon 26 – Sat 31 Oct, ~37 ih)

Goal: collect → draft → verify → approve → dry-run submit works end to end for INR, then live in the sandbox if G3 passed.

| ID | Task | Package | Depends | ih |
| --- | --- | --- | --- | --- |
| P2-1 | Fact extractors (dispute, transaction, order, fulfilment) + `build-case-file` + tests on fixtures | core | P1-2, P0-7 | 4 |
| P2-2 | LiveGateway: transaction search (windowing), orders, add-tracking, refund; fixtures for DS-003, DS-004 | paypal | P1-5 | 4 |
| P2-3 | Checklists (INR, refund-based, generic) + strength + tests | core | P2-1 | 3 |
| P2-4 | Verifier + token extraction + tests (including all negative cases) | core | P2-1 | 5 |
| P2-5 | Template fallback statements | core | P2-3 | 1.5 |
| P2-6 | Drafter on the Ollama client (`@ds/agent`): prompt v1 asks for JSON, `extractJsonObject` + zod, one repair retry, template fallback; `drafts` persistence; parse-rate metrics for evals | agent, db | P2-4, P2-5, P0-8 | 4 |
| P2-7 | Decision aid + deadlines + money helpers + tests | core | P2-3 | 2.5 |
| P2-8 | `collect_case` and `draft_case` handlers (one `JobHandlers` object used by both backends); case state machine; audit writes; `/api/disputes/:id/case` and `/draft` routes | core, db, api, jobs | P2-6, P2-7 | 3 |
| P2-9 | Submission builders (provide-evidence, accept-claim) + multipart per spike S3 + dry-run storage | paypal, db | P2-6, P0-5 | 3 |
| P2-10 | Case Workspace UI v1: facts, checklist, draft with citation chips, decision panel | web, ui | P2-8 | 5 |
| P2-11 | Approve modal + `/approve` and `/submit` routes + result display; accept-claim flow | api, web | P2-9, P2-10 | 3 |
| P2-12 | Fulfilment CSV import (API route + page) | api, web, schemas, db | P1-3 | 2 |
| P2-13 | **Render track:** implement `apps/workflows/src/handlers.ts` with the P2-8 handlers; parity test (same handlers through Postgres worker and through Render tasks); deploy the workflow; show a `process_dispute` run tree (S11) | workflows, api | P2-8, P1-12 | 3 |

**Exit criteria (Sat 31 Oct):** DS-001 in replay mode: collect, draft (Ollama model or template), verify, approve, dry-run stored, all visible in UI; DS-002 shows `NEEDS_INFO` and WEAK; DS-003 shows refund-proof path; DS-004 shows manual packet. If G3 passed live: one real sandbox `provide-evidence` succeeds from the UI. AC-CASE, AC-EVID, AC-VER, AC-DEC, AC-SUB, AC-LLM-01…05 pass; AC-RENDER-01…05 pass if Track B proceeds.

## 5. Phase 3 — Polish, Prevent, AG Studio, SDK (Sun 1 – Thu 5 Nov, ~42 ih)

**Start the AG Studio trial on Sun 1 Nov** (45-day trial → ends about 16 Dec, which covers the 1–15 Dec judging window ✅ trial length from the hackathon resources page). A trial started earlier would expire mid-judging.

| ID | Task | Package | Depends | ih |
| --- | --- | --- | --- | --- |
| P3-1 | Risk rules + evaluate + tests | core | P2-1 | 3 |
| P3-2 | `scan_transactions` handler, `/api/risk/*`, risk flag persistence | db, api | P3-1, P2-2 | 3 |
| P3-3 | Risk Radar UI + Add tracking and Refund modals (dry-run and live) | web, ui | P3-2 | 5 |
| P3-4 | Analytics endpoints for the four Studio data sources (`/api/analytics/*`, no PII; `14-prize-tracks.md` 2.3) | api | P2-8, P3-2 | 2 |
| P3-5a | Studio dashboard: S10 findings applied, data sources, default layout, theme from tokens (light and dark) | ui, web | P3-4 | 3 |
| P3-5b | Custom widget **Deadline runway** (view component + Studio wrapper + tests) | ui | P3-5a | 4 |
| P3-5c | Custom widget **Verifier ledger** | ui | P3-5a | 3 |
| P3-5d | **Dispute analyst**: proxy `AgLlmAdapter`, read-only `directLlmRunner` agent, prompt starters, tests (`14-prize-tracks.md` 2.6) | ui, web | P3-5a, P0-8 | 5 |
| P3-6 | UI polish: loading/empty/error states, responsive pass, dark mode, a11y pass | ui, web | P2-10 | 5 |
| P3-7 | Case Copilot (read-only toolkit tools driven by the Ollama client, verifier check) — **only if on schedule** | agent, api, web | P0-8 | 4 |
| P3-8 | PDF evidence packet — **only if on schedule** | api, web | P2-10 | 3 |
| P3-10 | Render: production secrets, cron job, Dec 1 to 15 plan (paid instance from credits), dashboard screenshots, README "what runs where" | workflows, docs | P2-13 | 2 |
| P3-11 | APIMatic (S13): Context Plugin notes, generate SDK + docs portal from `docs/openapi.json`, switch `apps/web` to `packages/api-client`, README section | api, web, docs | P1-13 | 3 |

**Decision on Thu 5 Nov end of day:** if the Health dashboard is not demo-ready, drop to one custom widget (keep Deadline runway), or use the fallback (AG Grid + standard Studio widgets) and note it. Drop order when behind: P3-7, P3-8, P3-11, P3-5c, then P3-5d last (it is the Agent Framework evidence).

**Exit criteria (Thu 5 Nov):** risk flags visible with working actions in dry-run; dashboard renders with real data; AC-RISK, AC-UI, AC-STUDIO, AC-APIM pass (except final polish items); the AG Studio start date is recorded.

## 6. Phase 4 — Hardening, tests, deploy, docs (Fri 6 – Mon 9 Nov, ~27 ih)

Feature freeze **Sun 8 Nov 23:59 IST**.

| ID | Task | ih |
| --- | --- | --- |
| P4-1 | Playwright e2e (replay mode): queue, case review/approve, prevent action, health, setup | 5 |
| P4-2 | LLM eval suite: golden and adversarial cases, wired as `pnpm eval` | 3 |
| P4-3 | Webhook edge tests (bad signature, duplicate, out-of-order), job retry tests, security review (secrets in web bundle, logs, auth, CORS, RLS) | 3 |
| P4-4 | Final deploy of profile A (web host + Render API/workflows/cron + Supabase); smoke test from a phone; confirm Supabase stays active and Render instance type covers 15 Dec | 3 |
| P4-5 | Record fresh fixtures for any scenario that changed; `ds replay-check` | 2 |
| P4-6 | README (quickstart for judges in replay mode in ≤ 5 commands, architecture diagram, limits, licence, how to go live in sandbox) | 4 |
| P4-7 | Bug bash against `08-acceptance-criteria.md`; fix list | 6 |
| P4-8 | Live-mode rehearsal of the demo path in sandbox (if G3 passed); record fallback | 1 |

**Exit criteria (Mon 9 Nov):** every Must acceptance criterion passes in CI or by recorded manual check; deployed URL works from a clean browser; fresh clone + README quickstart works on a second machine.

## 7. Phase 5 — Demo and submission (Mon 9 – Wed 11 Nov, ~12 ih)

| ID | Task | Date | ih |
| --- | --- | --- | --- |
| P5-1 | Final script from `10-demo-and-submission.md`, dry run twice, time it under 3:00 | Mon 9 Nov | 2 |
| P5-2 | Record screen + voiceover (no third-party trademarks or music; check the rules), edit, captions | Tue 10 Nov | 4 |
| P5-3 | Upload to YouTube as **public**, verify it plays logged out and is under 3 minutes | Tue 10 Nov | 0.5 |
| P5-4 | Devpost form: text, built-with, links (repo, demo, video), images, prize selections | Tue 10 – Wed 11 Nov | 3 |
| P5-5 | Final repo hygiene: licence visible, no secrets, tags, release `v1.0.0`; confirm repo is public | Wed 11 Nov | 1 |
| P5-6 | Submit; open the public project page in a private window and check every link | Wed 11 Nov by ~12:00 IST | 1.5 |

Buffer: Wed afternoon to Fri 01:30 IST. Do not make code changes after submit unless something is broken; The rules say that after the Submission Period ends you may not change the submission (only the sponsor and Devpost may permit removal of infringing or personal material) ✅, so what is on Devpost at the deadline is final. Draft versions can be saved before then ✅.

## 8. Scope by priority (MoSCoW)

| Priority | Items |
| --- | --- |
| **Must** | Fastify API with sessions and the OpenAPI document; Supabase-backed Postgres; Ollama client with template fallback; Sandbox connection and token management; webhook intake with verification and idempotency; polling sync; dispute sync; case collection; drafter + verifier + template fallback; decision panel; human approval; submit (live sandbox or dry-run); accept-claim; Dispute Queue; Case Workspace; seed data and replay mode; README and licence; demo script and video |
| **Should** | Prevent module (R-PROT, R-ADDR, R-NOTRACK; add tracking and proactive refund); AG Studio Health dashboard with two custom widgets and the Dispute analyst (Track A); Render Workflows backend (Track B); OpenAPI export and SDK (Track C); Case Copilot; PDF evidence packet |
| **Could** | `make-offer`; CSV import UI polish; email/Slack notifications; R-STUCK and R-HIGH; keyboard shortcuts |
| **Won't (this hackathon)** | Multi-tenant OAuth onboarding; live production PayPal; ML win-probability; Shopify/WooCommerce connectors; mobile app |

If at the Phase 2 exit you are more than 8 ih behind, drop Case Copilot and PDF packet from the plan immediately and tell no one they existed. If more than 16 ih behind, also drop Track C's APIMatic step (P3-11) and the Verifier ledger, and keep `DS_JOB_BACKEND=postgres` unless P2-13 already passed. Sponsor prizes are optional; the Must list and the first judging criterion are not.

## 9. Parallelisation (if more than one person)

| Lane | Owner focus | Packages |
| --- | --- | --- |
| A: PayPal & data | spikes, gateway, fixtures, db, jobs, webhooks, API routes, Render workflows, deploy | `paypal`, `db`, `fixtures`, `cli`, `api`, `workflows`, `jobs` |
| B: Engine | facts, checklists, verifier, decision, risk, drafter, evals | `core`, `agent`, `schemas` |
| C: UI | shell, grids, case workspace, Studio dashboard and analyst, generated client, polish | `ui`, `web` |

Interfaces between lanes are the `@ds/schemas` types, the `PayPalGateway` interface and the OpenAPI document (`docs/openapi.json`, checked in CI); agree and freeze them at the end of P1-2 and P1-5. Merge at least daily; CI must be green on `main`.

## 10. Working with coding agents

- Give each agent one row from the phase tables, the relevant spec files, and `AGENTS.md`. Do not give it "build the app".
- Order of reading for an agent: `AGENTS.md` → `architecture.md` → the spec for its package → `03-paypal-api-contract.md` if it touches PayPal → `08-acceptance-criteria.md` for its IDs.
- Every agent task ends with: lint, typecheck, tests for the touched packages, and the acceptance IDs it claims to satisfy.
- Use `12-start-prompt.md` for the first session.

## 11. Weekly checkpoints

| Date | Check |
| --- | --- |
| Mon 19 Oct | Go/no-go (section 1) |
| Sun 25 Oct | Phase 1 exit; queue shows fixtures; API deployed; Track B go/no-go; hours burned vs plan |
| Sat 31 Oct | Phase 2 exit; dry-run submit works; decide Should items |
| Thu 5 Nov | Phase 3 exit; dashboard decision |
| Sun 8 Nov | Feature freeze |
| Mon 9 Nov | Phase 4 exit; clean-clone test |
| Wed 11 Nov | Submitted |

## 12. Backlog (not in this sprint)

Token streaming for the Dispute analyst (Ollama call is `stream:false` today); Ollama structured outputs if cloud adds them; Supabase Auth for real users; Real OAuth for multiple merchants; Shopify and WooCommerce connectors; additional dispute reasons (unauthorised, not as described); carrier API integration for tracking status; seller-side templates library; Slack/email alerts; Postgres row-level security for multi-tenant; PayPal production onboarding and security review.
