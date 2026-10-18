<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Dispute Shield: answers PayPal disputes with evidence where every sentence cites your records and passes a verifier; you approve the exact request before anything is sent">
</p>

<p align="center">
  <a href="https://github.com/divyanshu-patil/DisputeShield/actions/workflows/ci.yml"><img src="https://github.com/divyanshu-patil/DisputeShield/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/PayPal-sandbox_only-2a5bd7?style=flat-square" alt="PayPal sandbox only">
  <img src="https://img.shields.io/badge/AI-gemma4%3A31b_on_Ollama_Cloud-2b363c?style=flat-square" alt="AI: gemma4:31b on Ollama Cloud">
  <img src="https://img.shields.io/badge/PayPal_Agent_Toolkit-1.11.0-2b363c?style=flat-square" alt="PayPal Agent Toolkit 1.11.0">
  <img src="https://img.shields.io/badge/Next.js-16-2b363c?style=flat-square" alt="Next.js 16">
  <img src="https://img.shields.io/badge/Fastify-5-2b363c?style=flat-square" alt="Fastify 5">
  <img src="https://img.shields.io/badge/Postgres-RLS_on_every_table-2b363c?style=flat-square" alt="Postgres with RLS on every table">
  <img src="https://img.shields.io/badge/licence-MIT-177245?style=flat-square" alt="MIT licence">
</p>

<p align="center">
  <a href="#try-it"><kbd> ▶ Try it in 5 commands </kbd></a>&nbsp;
  <a href="#how-it-works"><kbd> How it works </kbd></a>&nbsp;
  <a href="#verifier-evals"><kbd> Evals </kbd></a>&nbsp;
  <a href="#limits"><kbd> Limits </kbd></a>
</p>

<p align="center">
  <img src="./assets/readme/showcase.png" width="100%" alt="The DS-001 case page in replay mode: checklist all met, an AI evidence draft with 4 of 4 statements verified and their fact keys, and a Case Copilot answer about the shipping address marked Checked against the facts">
</p>

<p align="center">
  An open-source dispute desk for small PayPal sellers. It answers disputes with evidence where <b>every sentence cites a PayPal or seller record</b> and passes a deterministic verifier, and it flags order gaps (no tracking, address mismatch, no seller protection) before they turn into disputes. <b>Nothing is sent to PayPal without a human approving the exact request.</b>
  <br><sub>Built for "Build What's Next with PayPal and AI" (Devpost).</sub>
</p>

<p align="center">
  <img src="./assets/readme/stats.svg" width="100%" alt="Measured results: 15 of 15 AI drafts schema-valid on the first try; 15 of 15 adversarial outputs rejected by the verifier; 0 injected instructions accepted; 17 browser tests including axe accessibility on 7 pages">
</p>

<a name="what-it-does"></a>
<picture>
<source media="(prefers-color-scheme: dark)" srcset="./assets/readme/section-what-dark.svg">
<img src="./assets/readme/section-what.svg" width="100%" alt="01 What it does: six things on one case page">
</picture>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/tile-checklist.png" width="100%" alt="Checklist card for DS-001 with six requirements all marked Met">
      <h3>✓ A checklist from your records</h3>
      Tracking, delivery, address and seller protection, each checked against a fact. "Strength" is this checklist, never a win probability.
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/tile-draft.png" width="100%" alt="Evidence draft v1 marked Verified, each statement followed by the fact keys it cites">
      <h3>✎ A draft where every line cites a fact</h3>
      The model sees facts, not payloads. A statement whose number, date, ID or claim isn't in the facts it cites is removed.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/tile-source.png" width="100%" alt="Source drawer for the Response due fact showing fact key, value, source dispute, JSON path, fetch time and the raw PayPal record">
      <h3>⌕ Every fact opens its source</h3>
      Click a fact to see the PayPal or seller record it came from, the JSON path and when it was fetched.
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/tile-copilot.png" width="100%" alt="Case Copilot answering Is the address consistent with a sentence checked against the facts and its fact keys">
      <h3>? A Copilot that is checked too</h3>
      Read-only questions on the case. Answers must cite facts, and the verifier checks them sentence by sentence.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/tile-risk.png" width="100%" alt="Risk flag Address mismatch: the seller file ships to 10001 but the PayPal ship-to is 95131, with Add tracking, Refund and Dismiss buttons">
      <h3>⚑ Gaps caught before the dispute</h3>
      The risk radar flags payments with no tracking, a mismatched address or no seller protection, with a one-click fix.
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/tile-ledger.png" width="100%" alt="Verifier ledger: statements drafted, accepted by the verifier and drafts passed, with counts per rejection reason">
      <h3>▤ A ledger of what the verifier caught</h3>
      Statements drafted, accepted and rejected by reason, next to a deadline runway on the Health page.
    </td>
  </tr>
</table>

<a name="how-it-works"></a>
<picture>
<source media="(prefers-color-scheme: dark)" srcset="./assets/readme/section-how-dark.svg">
<img src="./assets/readme/section-how.svg" width="100%" alt="02 How it works: from PayPal record to approved answer">
</picture>

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="Five steps: PayPal records become facts with their source and JSON path; the AI drafts from facts only; the verifier checks numbers, dates and IDs against the cited facts, falling back to a template after two failures; you approve the exact request, stored as a dry run or sent to the sandbox">
</p>

<table>
  <tr>
    <td width="55%" valign="top">
      <h3>Why you can trust a draft</h3>
      <ul>
        <li><b>The model sees facts, not payloads,</b> and must cite fact keys for every statement. The verifier rejects any number, date, ID or claim not present in the cited facts; one repair attempt each for unparseable output and verifier failures, then a fixed template.</li>
        <li><b>No win probabilities.</b> "Strength" is a checklist result from your records.</li>
        <li><b>Money is integer minor units</b> end to end. Tracking and refund writes carry <code>PayPal-Request-Id</code>; dispute responses are stored as one submission per approval, so a retry cannot send twice. Every action lands in an append-only audit log.</li>
      </ul>
      <p>The Fastify API polls PayPal every 5 minutes (webhooks are wired too) and queues work on a Postgres job queue or Render Workflows; both run the same handlers. Each case also gets an evidence checklist and a decision aid (fight, accept or review) before the drafter, on Ollama Cloud, writes from the facts.</p>
    </td>
    <td width="45%" valign="top">
      <img src="./assets/readme/approve.png" width="100%" alt="The Review and approve evidence dialog showing the exact provide-evidence request for DS-001, with Replay data and Dry run badges and an I have read this and approve it checkbox">
      <p align="center"><sub>Nothing leaves until you tick <i>I have read this and approve it</i>. In dry run it is stored, not sent.</sub></p>
    </td>
  </tr>
</table>

<a name="try-it"></a>
<picture>
<source media="(prefers-color-scheme: dark)" srcset="./assets/readme/section-try-dark.svg">
<img src="./assets/readme/section-try.svg" width="100%" alt="03 Try it: five commands, no PayPal account">
</picture>

Needs Node 24, pnpm 11 and Docker.

```sh
pnpm install
cp .env.example .env            # replay mode + dry-run submit by default
docker compose up -d            # Postgres on localhost:5432
pnpm seed:demo                  # migrates and loads the demo shop
pnpm dev                        # web on http://localhost:3000, API on :4000
```

> [!TIP]
> Sign in with `DS_DEMO_ACCESS_CODE` from `.env`. Add `OLLAMA_API_KEY` and `LLM_MODEL` (we use `gemma4:31b`) for AI drafts; without them DS-001 and DS-003 show a recorded model draft (labelled), other drafts use plain templates, and everything else works.

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

<a name="under-the-hood"></a>
<picture>
<source media="(prefers-color-scheme: dark)" srcset="./assets/readme/section-hood-dark.svg">
<img src="./assets/readme/section-hood.svg" width="100%" alt="04 Under the hood: evals, Copilot, packet and layout">
</picture>

<a name="verifier-evals"></a>
<details open>
<summary><b>🧪 Verifier evals</b></summary>
<br>

`pnpm eval` runs hand-written model outputs through the real verifier, with no model needed; it also runs in CI, so one adversarial case getting through fails the build.

| Suite       | Cases                                                                                                                                                                                                                                            | Result        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Golden      | 16 true statements over the DS-001 and DS-003 facts (date and money formats, refunds, injection text inside fact data), plus the template draft for both                                                                                         | 100% accepted |
| Adversarial | 15: fabricated tracking number, invented carrier, future and shifted dates, rounded amount, "buyer confirmed receipt", another case's facts, real key with unrelated text, injected instructions, "refunded" citing no refund, too long, uncited | 100% rejected |

`pnpm ds eval:live` runs the real drafter on the seeded demo facts and writes `docs/evals/<date>.md`. On [2026-10-18](docs/evals/2026-10-18.md) with `gemma4:31b`, 5 runs per draftable scenario plus a prompt-injection variant: schema-valid on the first try 100% (15/15), accepted after at most one repair 100% (15/15), injected instructions accepted 0, and a manual read of every accepted statement found no fabricated claim.

Without an AI key, replay mode shows a recorded `gemma4:31b` draft for DS-001 and DS-003 (`packages/fixtures/src/recorded-drafts.ts`), labelled "Recorded model output". The verifier still checks it against the current facts, and any mismatch falls back to the template.

</details>

<details>
<summary><b>💬 Case Copilot</b></summary>
<br>

A read-only chat on the case page ("What is missing?", "Is the address consistent?", "Explain the deadline"). It answers from the case facts and the evidence checklist, and can look things up with four read tools: `get_dispute`, `get_order`, `get_shipment_tracking` and `list_transactions`. In live mode these are `@paypal/agent-toolkit` tools; replay mode serves the same tools from recorded data. Each tool result is stored in `raw_payloads` and turned into facts by the case-file extractors, so the model sees facts, never PayPal JSON. Every sentence of an answer must cite the facts it uses, and any date, amount, ID or carrier must match them, or the answer is replaced with "I could not verify that answer". It has no tool that can change anything. Without an AI key it says so.

</details>

<details>
<summary><b>📄 Evidence packet (PDF)</b></summary>
<br>

<p align="center">
  <img src="./assets/readme/packet.png" width="560" alt="First page of the DS-001 evidence packet PDF: dispute summary, four evidence statements with fact keys, the checklist and a citation appendix with source IDs, JSON paths and fetch times">
</p>

**Download evidence packet (PDF)** on the case page saves the case as a text PDF: dispute summary, the accepted statements with their fact keys, the checklist, and a citation appendix with each fact's source record, JSON path and fetch time. Cases without a draft get the facts only. It is generated by the API with no PDF library (`packages/pipeline/src/packet-pdf.ts`).

</details>

<details>
<summary><b>🗂️ Repository layout</b></summary>
<br>

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

<details>
<summary><b>⌨️ Commands</b></summary>
<br>

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

</details>

<details>
<summary><b>🔌 Going live in the sandbox</b></summary>
<br>

Set `DS_MODE=live`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` for a sandbox REST app with Disputes and Transaction search enabled. Keep `DS_SUBMIT_MODE=dry-run` until you have reviewed a stored request; `live` sends approved requests to the sandbox. Use the Supabase **session** pooler (port 5432), not the transaction pooler.

</details>

## Limits

> [!IMPORTANT]
>
> - Drafts evidence for item-not-received and refund cases only; other reasons get a manual fact packet.
> - The sandbox did not emit real dispute webhooks in our tests, so polling is the source of truth.
> - Transaction Search data can be up to 3 hours old.

## Docs

Specs live in `docs/` (start with `docs/architecture.md`); `docs/agent-pack.md` is the index of the planning pack. Licence: MIT (`LICENSE`).

<p align="center">
  <img src="./assets/readme/footer.svg" width="100%" alt="Dispute Shield, built for Build What's Next with PayPal and AI. PayPal sandbox only. Nothing sent without approval. MIT licence.">
</p>
