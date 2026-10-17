# Dispute Shield — agent pack

Planning and build documents for **Dispute Shield**, idea #1 from the PayPal AI Hackathon ideation: an open-source dispute desk for small PayPal sellers that (1) responds to disputes with citation-backed, verifier-checked evidence and (2) flags order gaps that cause disputes. Built as a **Turborepo** monorepo.

Hackathon: "Build What's Next with PayPal and AI" (Devpost). Deadline 12 Nov 2026 12:00 pm PST = **13 Nov 01:30 IST**. The plan targets submitting by **Wed 11 Nov ≈ 12:00 IST**. Pack written Sat 17 Oct 2026.

## How to use

Copy `AGENTS.md` and `CLAUDE.md` to the repo root and everything else into `docs/`. Then give your coding agent the prompts in `12-start-prompt.md`, one phase at a time.

## Reading order

| # | File | Read it to learn |
| --- | --- | --- |
| – | `AGENTS.md` | rules every coding agent must follow |
| 1 | `01-product-brief.md` | the user, the problem, scope, prize targets, demo data |
| 2 | `architecture.md` | system design, flows (mermaid), state machines, decisions (ADR-001…012) |
| 3 | `02-monorepo-structure.md` | the full Turborepo tree, configs, env vars, CI |
| 4 | `03-paypal-api-contract.md` | **what PayPal calls we may use**, with verified / unverified marks |
| 5 | `04-data-model.md` | Postgres tables, indexes, state machines |
| 6 | `05-evidence-engine-spec.md` | facts, checklists, drafter, verifier, decision aid, risk rules |
| 7 | `06-ui-spec.md` | screens, components, AG Grid and AG Studio usage |
| 8 | `07-implementation-plan.md` | phases, dated tasks, go/no-go, MoSCoW |
| 9 | `08-acceptance-criteria.md` | Given/When/Then with IDs |
| 10 | `09-test-plan.md` | unit, contract, integration, eval, e2e, security |
| 11 | `10-demo-and-submission.md` | video storyboard, Devpost text, submission checklist |
| 12 | `11-risks-and-day0-spikes.md` | spikes S0–S10, risk register, go/no-go record |
| 13 | `12-start-prompt.md` | prompts to drive the agent |

## Verification marks used everywhere

- ✅ read in an official source on 2026-10-17
- ⚠️ from memory or a third-party source; verify in the sandbox before depending on it
- ❓ unverified or the sources conflict; a spike must settle it

Nothing in the pack states a statistic, a win rate or a rival-free claim without a source. Judgements (risk likelihood, hour estimates, strength rubric, risk thresholds) are the author's and are labelled as such.

## The five findings that change the plan

1. **Sandbox disputes may not be scriptable.** The create-dispute endpoint needs buyer scopes that PayPal's account manager must add. Fallback: pay by credit card in the sandbox and open the dispute from the buyer UI. Spike S1 decides this on Day 0.
2. **Only three evidence types are used** (`PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, `OTHER`), so the product is honestly scoped to item-not-received and refund-proof cases.
3. **The documentation conflicts on the `provide-evidence` multipart format** (guide vs schema). Spike S3 settles it; dry-run is the safe default.
4. **`@paypal/agent-toolkit` has no evidence-upload or accept-claim tools**, so those use our own REST client. That is also where the technical depth is.
5. **AG Studio trial timing.** A 45-day trial must start on or after 1 Nov to cover the 1–15 Dec judging window.

Also note: the official rules say judges may judge from the text, images and video alone, that **Presentation** is one of five equally weighted criteria, and that the submission cannot be changed after the deadline.

## Not in this pack (needs your input)

- Your name/organisation for the licence file and Devpost.
- Eligibility check against the official rules (country, age, team).
- Sourced statistics for the Potential Impact story.
- Choice of LLM provider and key.
- Hosting account (Vercel + Neon, or alternatives) and retention terms through 15 Dec.
