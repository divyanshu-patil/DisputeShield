<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Dispute Shield: answers PayPal disputes with evidence where every sentence cites your records and passes a verifier; you approve the exact request before anything is sent">
</p>

<p align="center">
  <a href="#quickstart-replay-mode-no-paypal-account-needed">Quickstart</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#verifier-evals">Evals</a> ·
  <a href="#limits">Limits</a> ·
  <b>PayPal sandbox only</b>
</p>

<p align="center">
  <img src="./assets/readme/showcase.png" width="100%" alt="The DS-001 case page in replay mode: checklist all met, an AI evidence draft with 4 of 4 statements verified and their fact keys, and a Case Copilot answer about the shipping address marked Checked against the facts">
</p>

An open-source dispute desk for small PayPal sellers. It answers disputes with evidence where every sentence cites a PayPal or seller record and passes a deterministic verifier, and it flags order gaps (no tracking, address mismatch, no seller protection) before they turn into disputes. Nothing is sent to PayPal without a human approving the exact request.

Built for "Build What's Next with PayPal and AI" (Devpost).

## Why you can trust a draft

- **The model sees facts, not payloads,** and must cite fact keys for every statement. The verifier rejects any number, date, ID or claim not present in the cited facts; one repair attempt each for unparseable output and verifier failures, then a fixed template.
- **No win probabilities.** "Strength" is a checklist result from your records.
- **Money is integer minor units** end to end. Tracking and refund writes carry `PayPal-Request-Id`; dispute responses are stored as one submission per approval, so a retry cannot send twice. Every action lands in an append-only audit log.

## How it works

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="Five steps: PayPal records become facts with their source and JSON path; the AI drafts from facts only; the verifier checks numbers, dates and IDs against the cited facts, falling back to a template after two failures; you approve the exact request, stored as a dry run or sent to the sandbox">
</p>

The Fastify API polls PayPal every 5 minutes (webhooks are wired too) and queues work on a Postgres job queue or Render Workflows; both run the same handlers. Each case also gets an evidence checklist and a decision aid (fight, accept or review) before the drafter, on Ollama Cloud, writes from the facts. The Next.js console shows the case, and nothing leaves until you approve:

<p align="center">
  <img src="./assets/readme/approve.png" width="640" alt="The Review and approve evidence dialog showing the exact provide-evidence request for DS-001, with Replay data and Dry run badges and an I have read this and approve it checkbox">
</p>

## Quickstart (replay mode, no PayPal account needed)

Needs Node 24, pnpm 11 and Docker.

```sh
pnpm install
cp .env.example .env            # replay mode + dry-run submit by default
docker compose up -d            # Postgres on localhost:5432
pnpm seed:demo                  # migrates and loads the demo shop
pnpm dev                        # web on http://localhost:3000, API on :4000
```

Sign in with `DS_DEMO_ACCESS_CODE` from `.env`. Add `OLLAMA_API_KEY` and `LLM_MODEL` (we use `gemma4:31b`) for AI drafts; without them DS-001 and DS-003 show a recorded model draft (labelled), other drafts use plain templates, and everything else works.

### The demo shop (Hearthside Ceramics)

| ID             | Situation                                                                 | What to look at                                                                 |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| DS-001         | Item not received, tracked and delivered                                  | Verified draft with citations → Approve → dry run stored with the exact request |
| DS-002         | Item not received, no tracking, due in hours                              | Needs info → upload the demo CSV on Fulfilment → Re-collect → Ready             |
| DS-003         | Credit not processed, refund already issued                               | Proof-of-refund draft                                                           |
| DS-004         | Unauthorised payment                                                      | No drafting for this reason: manual packet, accept-claim option                 |
| RISK-001 / 002 | Unprotected payment with address mismatch; paid 50 h ago with no tracking | Risk page: add tracking, refund or dismiss                                      |

<p align="center">
  <img src="./assets/readme/screens.png" width="100%" alt="Four screens: the dispute queue sorted by deadline, the risk radar with high-severity payment gaps, the health page with deadline runway and verifier ledger, and the DS-003 case in dark mode">
</p>

## Verifier evals

`pnpm eval` runs hand-written model outputs through the real verifier, with no model needed; it also runs in CI, so one adversarial case getting through fails the build.

| Suite       | Cases                                                                                                                                                                                                                                            | Result        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Golden      | 16 true statements over the DS-001 and DS-003 facts (date and money formats, refunds, injection text inside fact data), plus the template draft for both                                                                                         | 100% accepted |
| Adversarial | 15: fabricated tracking number, invented carrier, future and shifted dates, rounded amount, "buyer confirmed receipt", another case's facts, real key with unrelated text, injected instructions, "refunded" citing no refund, too long, uncited | 100% rejected |

`pnpm ds eval:live` runs the real drafter on the seeded demo facts and writes `docs/evals/<date>.md`. On [2026-10-18](docs/evals/2026-10-18.md) with `gemma4:31b`, 5 runs per draftable scenario plus a prompt-injection variant: schema-valid on the first try 100% (15/15), accepted after at most one repair 100% (15/15), injected instructions accepted 0, and a manual read of every accepted statement found no fabricated claim.

Without an AI key, replay mode shows a recorded `gemma4:31b` draft for DS-001 and DS-003 (`packages/fixtures/src/recorded-drafts.ts`), labelled "Recorded model output". The verifier still checks it against the current facts, and any mismatch falls back to the template.

## Case Copilot

A read-only chat on the case page ("What is missing?", "Is the address consistent?", "Explain the deadline"). It answers from the case facts and the evidence checklist, and can look things up with four read tools: `get_dispute`, `get_order`, `get_shipment_tracking` and `list_transactions`. In live mode these are `@paypal/agent-toolkit` tools; replay mode serves the same tools from recorded data. Each tool result is stored in `raw_payloads` and turned into facts by the case-file extractors, so the model sees facts, never PayPal JSON. Every sentence of an answer must cite the facts it uses, and any date, amount, ID or carrier must match them, or the answer is replaced with "I could not verify that answer". It has no tool that can change anything. Without an AI key it says so.

## Evidence packet

**Download evidence packet (PDF)** on the case page saves the case as a text PDF: dispute summary, the accepted statements with their fact keys, the checklist, and a citation appendix with each fact's source record, JSON path and fetch time. Cases without a draft get the facts only. It is generated by the API with no PDF library (`packages/pipeline/src/packet-pdf.ts`).

## Repository layout

<details>
<summary>Apps and packages</summary>

| Path                | What                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js console (UI only): queue, case workspace, risk, health, fulfilment, audit, setup |
| `apps/api`          | Fastify: REST, sessions, webhook, cron tick, OpenAPI                                     |
| `apps/workflows`    | Render Workflows tasks running the same handlers                                         |
| `apps/cli`          | `ds seed:demo`, `ds replay-check`, `ds eval:live`, Day-0 spikes                          |
| `packages/core`     | facts, checklists, verifier, decision aid, risk rules, state machines (no frameworks)    |
| `packages/pipeline` | job handlers and case services shared by the API worker and Render                       |
| `packages/paypal`   | gateway (live + replay), submission builders                                             |
| `packages/agent`    | Ollama client, drafter                                                                   |
| `packages/db`       | Drizzle schema, migrations (RLS, append-only audit), repos, job queue                    |
| `packages/ui`       | design tokens, components, AG Grid wrapper, dashboard views                              |

</details>

## Commands

```sh
pnpm turbo run lint typecheck test   # all checks
pnpm openapi:export                  # writes docs/openapi.json (CI runs openapi:check)
pnpm ds replay-check                 # fixtures parse against @ds/schemas, no unredacted emails
pnpm eval                            # verifier evals (deterministic)
pnpm ds eval:live                    # live-model eval, needs OLLAMA_API_KEY and LLM_MODEL
pnpm ds eval:live --runs 1 --record  # also re-record the replay-mode model drafts
pnpm test:e2e                        # Playwright, replay mode, own servers and ds_e2e database
node scripts/check-bundle-secrets.mjs  # after a web build: no secret value in the bundle
```

## Going live in the sandbox

Set `DS_MODE=live`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` for a sandbox REST app with Disputes and Transaction search enabled. Keep `DS_SUBMIT_MODE=dry-run` until you have reviewed a stored request; `live` sends approved requests to the sandbox. Use the Supabase **session** pooler (port 5432), not the transaction pooler.

## Limits

- Drafts evidence for item-not-received and refund cases only; other reasons get a manual fact packet.
- The sandbox did not emit real dispute webhooks in our tests, so polling is the source of truth.
- Transaction Search data can be up to 3 hours old.

## Docs

Specs live in `docs/` (start with `docs/architecture.md`); `docs/agent-pack.md` is the index of the planning pack. Licence: MIT (`LICENSE`).
