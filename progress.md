# Progress

Task IDs are from `docs/07-implementation-plan.md`. Updated with each commit.

## Phase 0 — Spikes and set-up

| ID    | Task                                               | Status                           | Evidence                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1  | Turborepo skeleton, starter packages, CI, licence  | Done (2026-10-17)                | see below                                                                                                                                                                                                                                             |
| P0-2  | S0: developer account, sandbox accounts, REST app  | Partial (2026-10-17)             | token 200, 29 scopes, `disputes/update-seller` present; **`reporting/search/read` missing** (enable Transaction search). Log: `docs/decisions/0001-day0-spike-results.md`; fixture `paypal/oauth/token.json` (human-read); contract section 1 updated |
| P0-3  | S1: create a sandbox dispute                       | Done (2026-10-17)                | Route B with a US buyer: 3 payments, 3 item-not-received disputes; seller list shows them (`WAITING_FOR_SELLER_RESPONSE`, `UNDER_REVIEW`). Log: `docs/decisions/0001-day0-spike-results.md`                                                           |
| P0-4  | S2: fetch list and details, first fixtures         | Done (2026-10-17)                | 3 disputes, details parse against `@ds/schemas` `PaypalDisputeDetails`; fixtures awaiting your read                                                                                                                                                   |
| P0-5  | S3/S4: provide-evidence, accept-claim              | S3 done, S4 partial (2026-10-17) | evidence accepted (multipart form A, USPS); accept-claim 200 and refund issued, dispute not RESOLVED yet. Fixtures awaiting your read                                                                                                                 |
| P0-6  | S5: webhook + signature verification               | Not started                      |                                                                                                                                                                                                                                                       |
| P0-7  | S6/S7/S8: transaction search, orders, tracking     | Not started                      |                                                                                                                                                                                                                                                       |
| P0-8  | S9: Ollama Cloud model choice                      | Not started                      |                                                                                                                                                                                                                                                       |
| P0-10 | Accounts: Supabase, Ollama Cloud, Render, APIMatic | In progress (you)                | Supabase URL in `.env` (see open items)                                                                                                                                                                                                               |
| P0-9  | Contract update, go/no-go note                     | Not started                      |                                                                                                                                                                                                                                                       |

## Phase 1 — Foundations

| ID           | Task                                                     | Status              | Evidence                                                                    |
| ------------ | -------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| P1-0         | Adopt the starter (api, workflows, jobs, schemas, agent) | Done (2026-10-17)   | starter tests green; `/api/health` and `/api/openapi.json` answer in replay |
| P1-1         | Shared configs, ESLint boundary rules, Vitest            | Done early, in P0-1 | `packages/config-eslint/test/boundaries.test.ts` (39 tests)                 |
| P1-2 … P1-13 |                                                          | Not started         |                                                                             |

## P0-1 / P1-0 check record (2026-10-17, local, Node 24.10, pnpm 11.25.0)

- `pnpm install && pnpm turbo run lint typecheck test`: 44/44 tasks pass.
- Test counts: schemas 3, agent 26, api 44, jobs 6, workflows 6 (the same as the pack's numbers); config-eslint 39, web 2, every empty package 1.
- `pnpm turbo run build --filter=@ds/api --filter=@ds/workflows --filter=@ds/web`: passes; writes `apps/api/dist/index.js` and `apps/workflows/dist/{index,trigger}.js`.
- `pnpm dev`: web on :3000 renders "Dispute Shield"; api on :4000 answers `GET /api/health` (replay, dry-run, sandbox, database `not_configured`, llm `not_configured`); `GET :3000/api/health` reaches the API through the rewrite; `/api/openapi.json` is 200.
- `pnpm ds --help` prints usage.
- Boundary and `process.env` rules were tested with deliberately bad files.
- S0 tooling (2026-10-17): `requestToken`, error taxonomy, `redact` in `@ds/paypal` (5 tests); `ds spike s0` in the CLI.
- S1 tooling (2026-10-17): `paypalGet` in `@ds/paypal` (2 tests), `ds spike s1`.
- S2 tooling (2026-10-17): `PaypalDisputeDetails`/`PaypalDisputeList` schemas, party-aware `redact`, `ds spike s2`.
- S3/S4 tooling (2026-10-17): `paypalRequest` (JSON/multipart), `evidenceFormA`, error issue codes, `ds spike s3|s4 [--send]`.
- Not run: CI on GitHub (there is no remote yet), `docker compose up`, anything against PayPal, Supabase, Ollama or Render.
- Deviations from the spec: `docs/decisions/0000-p0-1-scaffold-deviations.md`.

## Open items for you

0. **Enable "Transaction search"** on the sandbox REST app (Apps & Credentials → app → features), then re-run `pnpm ds spike s0`; needed for S6 / gate G5.
1. **`DATABASE_URL` and `DATABASE_URL_TEST` in `.env` use the Supabase transaction pooler (port 6543).** AGENTS.md rule 13 forbids it. Switch to the session pooler (same host, port 5432) or the direct URL. Point `DATABASE_URL_TEST` at the local `docker compose` database (`postgres://ds:ds@localhost:5432/ds_test`), not at Supabase, because tests will reset it.
2. Replace `[COPYRIGHT HOLDER]` in `LICENSE`.
3. Create the GitHub repo and add it as `origin` so CI can run.
4. Still to fill in `.env`: `PAYPAL_WEBHOOK_ID` (S5), `PAYPAL_SANDBOX_BUYER_EMAIL`, `OLLAMA_API_KEY` + `LLM_MODEL` (S9), `RENDER_*` (P1-12).

## Next

Read the S3/S4 fixtures and approve the contract edits for 2.3/2.4; re-check PP-R-AUY-10193248 for RESOLVED. Then S5 (webhooks; needs `PAYPAL_WEBHOOK_ID` and a public URL). Set `PAYPAL_SANDBOX_BUYER_EMAIL` in `.env` to the new US buyer account.
