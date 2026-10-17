# Dispute Shield — agent pack

Planning documents and tested starter code for **Dispute Shield**, idea #1 from the PayPal AI Hackathon ideation: an open-source dispute desk for small PayPal sellers that (1) responds to disputes with citation-backed, verifier-checked evidence and (2) flags order gaps that cause disputes. Built as a **Turborepo** monorepo.

Hackathon: "Build What's Next with PayPal and AI" (Devpost). Deadline 12 Nov 2026 12:00 pm PST = **13 Nov 01:30 IST**. The plan targets submitting by **Wed 11 Nov ≈ 12:00 IST**. Pack written Sat 17 Oct 2026; revised the same day for the stack below.

## Stack (decided 2026-10-17)

| Concern | Choice |
| --- | --- |
| Monorepo | Turborepo + pnpm, TypeScript |
| UI | Next.js (UI only), React 19, Tailwind 4, AG Grid, AG Studio |
| Backend | **Fastify 5** service in `apps/api` (REST, webhook, cron tick, Studio LLM proxy, OpenAPI) |
| Database | **Supabase** Postgres (plain Postgres only) + Drizzle; `docker compose` Postgres locally |
| LLM | **Ollama Cloud** (`https://ollama.com/api/chat`); no structured outputs, so parse + validate + repair + template fallback |
| Jobs | Postgres queue (default) or **Render Workflows** tasks (`DS_JOB_BACKEND=render`) |
| Deploy | Render (API, workflows, cron) via `render.yaml`; web on Vercel or Render |
| Prize tracks | AG Grid (Studio widgets + agent), Render, APIMatic, Best Use of PayPal + AI — `14-prize-tracks.md` |

## What is in the box

**Documents** (copy `AGENTS.md`, `CLAUDE.md` to the repo root and every other `.md` into `docs/`).

**Starter code**, verified offline on 2026-10-17 in a scratch workspace (typecheck clean; test counts below):

| Path | What | Tests |
| --- | --- | --- |
| `apps/api` | Fastify service: health, access-code sessions, PayPal webhook (raw body, idempotent), cron tick, disputes list/get, Studio LLM proxy, OpenAPI, in-memory adapters, Render job queue | 44 |
| `apps/workflows` | Render Workflows tasks (one per job kind + `process_dispute`), cron trigger; handlers are empty | 6 |
| `packages/jobs` | job kinds with zod payloads, `createJobRunner` | 6 |
| `packages/schemas` | AG Studio ↔ API wire types | 3 |
| `packages/agent` | Ollama Cloud client, JSON extraction, Studio turn translation | 26 |
| `render.yaml` | Blueprint: API web service + workflow + cron (not applied to a real account yet) | – |

**What the starter has not done:** talk to real PayPal, Supabase, Render or a live Ollama model (Ollama was exercised only through a mocked `fetch`). Spikes S1–S13 settle that. The shared config packages, `core`, `db`, `paypal`, `ui`, `web`, `cli` and `fixtures` are specs only.

## How to use

Copy the docs and the starter folders into the new repo, then give your coding agent the prompts in `12-start-prompt.md`, one phase at a time. Start with Prompt 0 (orientation, no code) and Prompt 1 (skeleton; it adopts the starter).

## Reading order

| # | File | Read it to learn |
| --- | --- | --- |
| – | `AGENTS.md` | rules every coding agent must follow |
| 1 | `01-product-brief.md` | the user, the problem, scope, prize targets, demo data |
| 2 | `architecture.md` | system design, flows (mermaid), state machines, decisions (ADR-001…017) |
| 3 | `02-monorepo-structure.md` | the full Turborepo tree, configs, env vars, CI, Render build |
| 4 | `03-paypal-api-contract.md` | **what PayPal calls we may use**, with verified / unverified marks |
| 5 | `04-data-model.md` | Postgres tables, analytics views, state machines, Supabase notes |
| 6 | `05-evidence-engine-spec.md` | facts, checklists, drafter (Ollama), verifier, decision aid, risk rules |
| 7 | `06-ui-spec.md` | screens, components, AG Grid and AG Studio usage |
| 8 | `07-implementation-plan.md` | phases, dated tasks, go/no-go, MoSCoW (≈165 ih full, ≈120 ih Must-only) |
| 9 | `08-acceptance-criteria.md` | Given/When/Then with IDs, including API, LLM, DB and prize-track criteria |
| 10 | `09-test-plan.md` | unit, API, workflow, contract, integration, eval, e2e, security |
| 11 | `10-demo-and-submission.md` | video storyboard, Devpost text, submission checklist |
| 12 | `11-risks-and-day0-spikes.md` | spikes S0–S13, risk register R1–R31, go/no-go record |
| 13 | `12-start-prompt.md` | prompts to drive the agent |
| 14 | `13-api-service-spec.md` | the Fastify service: routes, webhook rules, sessions, jobs, LLM proxy, env, tests |
| 15 | `14-prize-tracks.md` | which prizes depend on code, and the specs for AG Grid, Render, APIMatic, PayPal + AI |

## Verification marks used everywhere

- ✅ read in an official source on 2026-10-17
- ⚠️ from memory or a third-party source; verify in the sandbox before depending on it
- ❓ unverified or the sources conflict; a spike must settle it

Nothing in the pack states a statistic, a win rate or a rival-free claim without a source. Judgements (risk likelihood, hour estimates, strength rubric, risk thresholds) are the author's and are labelled as such.

## The findings that change the plan

1. **Sandbox disputes may not be scriptable.** The create-dispute endpoint needs buyer scopes that PayPal's account manager must add. Fallback: pay by credit card in the sandbox and open the dispute from the buyer UI. Spike S1 decides this on Day 0.
2. **Only three evidence types are used** (`PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, `OTHER`), so the product is honestly scoped to item-not-received and refund-proof cases.
3. **The documentation conflicts on the `provide-evidence` multipart format** (guide vs schema). Spike S3 settles it; dry-run is the safe default.
4. **`@paypal/agent-toolkit` has no evidence-upload or accept-claim tools**, so those use our own REST client.
5. **AG Studio trial timing.** A 45-day trial must start on or after 1 Nov to cover the 1–15 Dec judging window.
6. **Ollama Cloud has no structured outputs and a one-request free tier.** The drafter cannot rely on the model obeying a schema; the verifier and the template fallback carry the safety argument.
7. **Supabase's transaction pooler (port 6543) breaks the jobs queue and migrations.** Use the session pooler or direct URL. Free projects pause after 7 quiet days; Render free web services sleep after 15 minutes.
8. **Only one sponsor prize can be won,** so the AG Grid, Render and APIMatic tracks are alternative shots, not additive. Sponsor judging criteria beyond "use the tools" are mostly unpublished ❓.
9. **A browser-to-API session gap exists in the starter:** the cookie is `SameSite=Lax`, so a cross-site browser call would not send it. The documented fix is a same-origin `/api/*` rewrite, with a bearer-token fallback (ADR-015, spike S12).

Also note: the official rules say judges may judge from the text, images and video alone, that **Presentation** is one of five equally weighted criteria, and that the submission cannot be changed after the deadline.

## Not in this pack (needs your input)

- Your name/organisation for the licence file and Devpost.
- Eligibility check against the official rules (country, age, team).
- Sourced statistics for the Potential Impact story.
- Accounts and keys: PayPal sandbox, Supabase, Ollama Cloud (and which model, spike S9), Render, AG Studio trial (start 1 Nov), APIMatic.
- Retention and cost decisions for the judging window (paid Render instance from the $50 credits; Supabase paused-project check).
