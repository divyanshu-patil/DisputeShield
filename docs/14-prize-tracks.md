# 14. Prize tracks that depend on code

This file picks the prize categories whose outcome depends on what is in the repository, says what the repository must contain for each, and gives the coding agent concrete specs. It does not estimate anyone's chance of winning.

## 0. How the prizes combine (rules ✅, read 2026-10-17)

- "A project can only win up to one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize."
- Sponsor prizes (AG Grid, APIMatic, Bryntum, Channel3, Render) are open to "all eligible submissions that use any \<sponsor\> tools". So using several sponsors' tools makes the project eligible for each, but **at most one sponsor prize can be won**. The tracks below are alternative shots at one sponsor prize, not additive. They still all strengthen the first judging criterion (Technological Implementation), which is judged for every submission.
- The Grand Prizes and the five Honorable Mention categories can be combined with one sponsor prize.

| Prize | Amount | Depends on code? | Targeted here |
| --- | --- | --- | --- |
| Grand Prize 1st / 2nd / 3rd | $12,000 / $8,000 / $5,000 | Yes, for Technological Implementation; other criteria are not code | Indirectly (everything in this pack) |
| Best Use of PayPal + AI (HM) | $5,000 | Yes | **Track D** |
| Best Use of Agentic Commerce (HM) | $5,000 | Yes, but the project is a dispute desk, not a buying agent | Not targeted |
| Most Creative, Most Impactful, Best Demo Delivery (HM) | $5,000 each | No (idea, impact and video) | Covered by `01` and `10` |
| Best Use of AG Grid | $5,000 / $2,000 / $1,000 ×3 | Yes | **Track A** |
| Best Use of Render | $1,000 / $750 / $500 in Render credits | Yes | **Track B** |
| Best Use of APIMatic | $1,000 ×3 + 6 months APIMatic Business | Yes | **Track C** |
| Best Use of Bryntum | $1,000 ×3 | Yes (Bryntum scheduler/Gantt/grid products) | Not targeted: no natural fit and it would add a fourth paid-licence dependency ⚠️ |
| Best Use of Channel3 | $1,500 | Yes (product search API) | Not targeted: no product-search need |

Judging criteria for the sponsor prizes beyond "use the tools" were not published in the pages read ❓, except AG Grid's, which the hackathon resources page describes (custom widgets, theming and layout, Studio Agent Framework ✅). Do not claim a sponsor criterion in the Devpost text that you have not read.

**Build order by cost and risk:** C (OpenAPI export, cheapest) → B (Render, mostly config plus a thin task layer) → A (AG Studio, riskiest because the custom-widget API is new to us) → D (a narrative over code that exists anyway). Priority in `07-implementation-plan.md` section 8.

---

## 1. Shared requirement: everything must be visible without running the app

The rules let judges decide from text, images and video alone and allow automated AI analysis of the submission ✅. For each track the repo needs: a README section naming the tool and where it is used (file paths), a screenshot in `docs/img/`, a few seconds in the video, and a line in the Devpost "Built with" list. Details in `10-demo-and-submission.md`.

---

## 2. Track A: Best Use of AG Grid (AG Grid + AG Studio)

### 2.1 What the judges reward ✅

Per the hackathon resources page: custom widgets, theming and layout, and use of the Studio Agent Framework. We therefore build, in `packages/ui/src/studio`:

1. a **Dispute Health dashboard** in AG Studio with two **custom widgets**,
2. a **theme** generated from the app's design tokens, and a deliberate default layout,
3. a **Dispute analyst** agent built with the Studio Agent Framework, answering questions about the dashboard's data through our own LLM adapter (Ollama Cloud behind the Fastify proxy).

The dispute queue and risk radar use AG Grid Community (`ag-grid-react` 36.x) ✅; that is ordinary use and needs no special work beyond the UI spec.

### 2.2 Verified facts about the SDK (types read from `ag-studio@3.0.0` and `ag-studio-react@3.0.0`, 2026-10-17 ✅)

| Topic | Fact |
| --- | --- |
| Component | `AgStudio` from `ag-studio-react`; props include `data`, `mode` (`view` \| `edit`), `theme`, `ai`, `widgets`, `components`, `initialState`, `layout`, `panels`, event handlers |
| Data | `data` is a list of data sources. A simple source is `{ id, name?, data: Record<string, primitive>[], fields? }`; an async source has `getData`, `tables`, `dataShape` |
| AI wiring | `ai` accepts an `AgAiHarness` or `(params) => AgAiHarness`; `createAiHarness(api, builderOrDefaults)` builds Studio's harness |
| Harness config | `{ agents, primary, models?, history?, promptStarters?, observers? }`; `AgAiPromptStarter = { label, prompt, icon? }` |
| Agent loop | `directLlmRunner({ id, name, description, adapter, instructions, tools, maxTurns, ... })` runs Studio's loop in the browser against an `AgLlmAdapter`; `clientToolRunner` is for a server-driven loop |
| Tools for an agent | `ctx.studio` offers `viewSchema`, `viewReport`, `viewPage`, `viewWidget`, `executeQuery` (read) and `createExpression`, `updateExpression`, `deleteExpression`, `addWidget`, `positionWidget`, `removeWidget`, `addPageFilter`, `removePageFilter`, `addWidgetFilter`, `removeWidgetFilter`, `configureWidget` (write) |
| LLM boundary | `AgLlmAdapter.executeTurn(request, { signal, trace }) → { stream: AsyncIterable<AgAiEvent>, complete: Promise<AgLlmResponse> }`. "Studio never talks to a provider itself." |
| Events | AG-UI style: `TEXT_MESSAGE_START/CONTENT/END`, `TOOL_CALL_START/ARGS/END`, plus run, step, reasoning and state events. An adapter emits content events only |
| Response | `{ id, createdAt, status, output: (message \| reasoning \| function_call)[], error?, usage?, model? }` |
| Custom widgets | `createWidgets({ additionalTypes: [...], menu?, overrides?, defaultType? })` from `ag-studio-react`. A definition has `id`, `label`, `comp`, `defaultSize`, `minSize`, `form`, optional `dataMapping`, `formatShape`, `defaultState`, `toolbar`, `ai` metadata. In React, `comp` may be a component or a string key resolved through the `components` prop |
| Typing | A custom widget id must exist in a **custom registry type** (`AgRegistry` with your widget definitions in `widgets`), otherwise TypeScript rejects `additionalTypes` |
| Widget data | A widget component receives `AgWidgetParams` including `widgetApi.getData(query)`, which returns rows from Studio's data engine (so widgets respect page filters and cross-filtering) |
| Licence | `AgStudioLicenseManager` exists in the package; the key mechanism and the lapsed-trial behaviour were **not** confirmed ❓ (spike S10). Trial is 45 days; start it on or after 1 Nov so it covers 1 to 15 Dec |

### 2.3 Data sources (served by `apps/api`)

| Source id | Rows | Fields (examples) |
| --- | --- | --- |
| `disputes` | one per dispute | `id`, `reason`, `paypal_status`, `case_state`, `amount_minor`, `currency`, `seller_response_due` (datetime), `hours_to_due`, `strength`, `verifier_passed` |
| `evidence_items` | one per checklist item per case | `dispute_id`, `item_key`, `status` (`present`/`missing`/`unverified`), `required` |
| `statements` | one per generated statement | `dispute_id`, `accepted` (bool), `reject_reason`, `fact_key_count` |
| `risk_flags` | one per flag | `rule`, `order_value_minor`, `currency`, `status`, `created_at` |

Endpoints (to build, P3-4): `GET /api/analytics/disputes|evidence-items|statements|risk-flags`, session required, no PII (no names, emails, addresses). Money stays in minor units; the dashboard formats at the edge. The dashboard `mode` is `view` for judges and `edit` behind a toggle.

### 2.4 Custom widgets

**Deadline runway.** A horizontal timeline from now to +14 days. One mark per open dispute at its `seller_response_due`, coloured by `strength`, sized by `amount_minor`. Overdue and under-24-hour marks are drawn in a distinct style plus a text label (never colour only). Clicking a mark navigates to the case. It shows deadlines and money, never a probability.
- Data mapping: `due` (datetime field), `amount` (number), `state` (string), `id` (string).

**Verifier ledger.** A compact ledger for the selected period: statements generated, accepted, rejected (with counts by reason `NO_CITATION`, `UNKNOWN_FACT`, `VALUE_MISMATCH`, `TOO_LONG`), and the share of cases whose draft passed the verifier on the first try. It makes "every sentence is checked" visible on the dashboard.
- Data mapping: `accepted` (boolean), `reason` (string), `dispute` (string).

Each widget: a pure React view component (`DeadlineRunwayView`, `VerifierLedgerView`) that takes rows and returns markup, plus a thin wrapper that calls `widgetApi.getData` and re-queries when filters change. The view components are unit-tested with Testing Library and need no Studio at all. Both widgets provide `ai` metadata (label, description, usage) so the analyst can configure them, and have keyboard-accessible, labelled output.

If the typed custom-widget registration costs more than 3 ih, ship **one** widget (Deadline runway), implement the other as a normal grid or value widget, and record it in `docs/decisions/`. Decision point: Thu 5 Nov (see plan).

### 2.5 Theme and layout

- `src/studio/theme.ts` builds the Studio theme from `@ds/ui` design tokens (colour, radius, font, spacing) using `createStudioTheme` / `studioGridTheme` from `ag-studio` ✅ (exports exist; check the parameter names against the installed types).
- Light and dark both defined; the dashboard follows the app's colour scheme.
- Default layout: top row three value widgets (open disputes, money at risk by currency, due in 24 h); middle row Deadline runway full width; bottom row Verifier ledger beside a grid of disputes. Saved as `initialState` and also shipped as `docs/img/health-dashboard.png`.

### 2.6 The Dispute analyst (Studio Agent Framework)

**Browser adapter** `createProxyLlmAdapter({ apiBaseUrl })` implements `AgLlmAdapter`:
- `executeTurn(request, { signal })` POSTs the request to `/api/studio/llm/turn` with `credentials: "include"` and the abort signal.
- It returns `{ stream, complete }`. `complete` is the parsed `StudioTurnResponse` mapped to `AgLlmResponse`. `stream` replays the finished response as events: for each output message `TEXT_MESSAGE_START`, one `TEXT_MESSAGE_CONTENT` per text part, `TEXT_MESSAGE_END`; for each tool call `TOOL_CALL_START` (`toolCallId`, `toolCallName`), `TOOL_CALL_ARGS` (`delta` = the JSON string), `TOOL_CALL_END`.
- Network failure, 401 or any non-2xx must not throw into Studio: resolve `complete` with `status: "failed"` and `error: { code, message }`, with a plain message ("Sign in to use the analyst"). Whether Studio shows `error` from a failed response is ❓ (S10).
- Ollama is called with `stream: false` today, so streaming is simulated. Real token streaming is a later improvement (ADR-016).

**Agent** `directLlmRunner({ id: "dispute-analyst", ... })`:
- Tools: exactly `viewSchema`, `viewReport`, `viewPage`, `viewWidget`, `executeQuery`. **Read-only by construction**; adding a tool is a security review item (ADR-017). A unit test asserts the tool list.
- Instructions: answer only from query results; run a query before stating a number or date; cannot change the dashboard or contact PayPal or the buyer; never state or imply a chance of winning; no legal advice; no personal data; brief, most urgent deadline first.
- `maxTurns: 6`.
- Prompt starters: "What is due soonest?", "What is blocking drafts?", "Money at stake", "Where do disputes come from?" (each with a full prompt).
- Model: server default `LLM_MODEL`. Optionally offer `models` for a picker once S9 shows more than one model works with tools.

**Reference sketch (not compiled; written against the 3.0.0 types above, to be verified in S10).**

```ts
// packages/ui/src/studio/llm-adapter.ts (sketch)
export function createProxyLlmAdapter(o: { apiBaseUrl: string; fetch?: typeof fetch }): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      const complete = runTurn(o, request, options?.signal);   // never rejects; failure = status "failed"
      return { stream: eventsFrom(complete), complete };
    },
  };
}

// packages/ui/src/studio/analyst.ts (sketch)
export const createDisputeAnalystHarness = (adapter: AgLlmAdapter) => ({ api }: { api: AgStudioApi }) =>
  createAiHarness(api, () => ({
    agents: [directLlmRunner({
      id: "dispute-analyst", name: "Dispute analyst",
      adapter, instructions: () => ANALYST_INSTRUCTIONS,
      tools: ({ studio }) => [studio.viewSchema(), studio.viewReport(), studio.viewPage(), studio.viewWidget(), studio.executeQuery()],
      maxTurns: 6,
    })],
    primary: "dispute-analyst",
    promptStarters: ANALYST_STARTERS,
  }));
```

### 2.7 Acceptance and evidence

Acceptance IDs AC-STUDIO-01 to AC-STUDIO-08 in `08-acceptance-criteria.md`. Evidence for judges: screenshots of the dashboard (light, dark), of the analyst answering with a query result, the theme file, and the widget files linked from the README.

### 2.8 Risks

Custom widget typing and registration (S10); licence key behaviour; Studio chat failing visibly when the model is down (the replay `StudioLlm` returns an honest notice); 1 concurrent request on the free Ollama tier ✅ means two users chatting at once will see 429s: the adapter surfaces "busy, try again" from `Retry-After`.

---

## 3. Track B: Best Use of Render (Render Workflows)

### 3.1 What we use ✅ (Render docs and `@renderinc/sdk` 1.2.0, read 2026-10-17)

| Render product | Used for | Notes |
| --- | --- | --- |
| Web service | `apps/api` (Fastify) | Free instances spin down after 15 min idle (about 1 min cold start) ✅; 750 free hours a month ✅. PayPal retries webhooks, but use a paid instance in judging |
| **Workflows** | The dispute pipeline: one task per job kind, plus `process_dispute` | `type: workflow` in the Blueprint supports node and python only, and no `plan` or `preDeployCommand` ✅ |
| Cron job | Starts `sync_disputes` every 5 minutes | Workflows have no native schedule ✅ |
| Static site / web service | Optional host for `apps/web` | Vercel is equally fine |
| Postgres | **Not used.** The database is Supabase (free Render Postgres expires after 30 days ✅) | |

Hackathon credit: $50 Render credits ✅ (resources page).

### 3.2 Why Workflows fits this product

A dispute has a hard deadline, a rate-limited upstream (PayPal), a slow and fallible step (the LLM), and a rule that nothing is submitted without a human. Workflows gives per-step retry with backoff, per-run timeouts, isolated compute per task and a run history you can show in the video. `process_dispute` runs `collect_case` then `draft_case` as separate task runs, so a model failure retries only the drafting.

### 3.3 Code layout (starter included in this pack)

```text
packages/jobs/src/kinds.ts       job kinds + zod payloads (ids only)
packages/jobs/src/runner.ts      createJobRunner(handlers).run(kind, payload)   // validates, dispatches
apps/workflows/src/tasks.ts      defineTasks(runner): one task() per kind + process_dispute
apps/workflows/src/handlers.ts   buildHandlers(): composes @ds/db, @ds/paypal, @ds/core, @ds/agent  (EMPTY in the starter)
apps/workflows/src/index.ts      imports tasks so the SDK registers them
apps/workflows/src/trigger.ts    cron entry: startTask("<slug>/sync_disputes", [{}], { idempotencyKey: bucket })
apps/api/src/adapters/render-queue.ts   RenderJobQueue implements JobQueue
render.yaml                      web + workflow + cron
```

Task rules (all implemented in the starter, 6 tests):
- Task names equal job kind names (`sync_disputes`, `sync_dispute`, `collect_case`, `draft_case`, `scan_transactions`, `record_fixture`) plus `process_dispute`.
- Retry: `{ maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 }`; `record_fixture` does not retry. Timeouts: 300 s sync, 600 s collect, 900 s draft and scan, 3600 s for `process_dispute`. (Valid range 30 to 86400 s ✅.)
- Each task validates its payload with the `@ds/jobs` schema before running; a bad payload throws, so Render's retries do not loop on garbage.
- A task with no handler fails with `JobNotImplementedError`, so Render shows the failure instead of a silent success.
- `process_dispute` never submits. Submission is a separate, human-approved API action.
- Task functions are plain functions, so unit tests call `task.func(ctx, payload)` with a fake context (the SDK exposes `func` ✅).

What the coding agent must still do (tasks P2-13 and P3-10): implement `buildHandlers()` by registering the same handlers the Postgres worker uses (P2-8), deploy the Blueprint, set the secrets, run `render workflows dev -- tsx src/index.ts` locally ✅ (SDK README) before deploying, and confirm a webhook produces a visible task run (spike S11).

### 3.4 Idempotency

- Webhook-driven jobs: `dedupeKey` = PayPal event id → idempotency key `sync_dispute:<eventId>`; Render keeps keys 24 h ✅, so a redelivered webhook cannot start a second run (the events table also dedupes).
- Jobs without a key: key includes a 5-minute time bucket so a sync requested later is not swallowed by an identical earlier key.

### 3.5 Acceptance and evidence

AC-RENDER-01 to AC-RENDER-06. Evidence: `render.yaml`, a screenshot of a task run tree (`process_dispute` → `collect_case` → `draft_case`) in the Render dashboard, and a README table "what runs where".

### 3.6 Risks

Blueprint syntax unverified in a real account (S11); the Workflows product is new (check its status and limits before relying on it); free web-service cold starts; Workflows availability to the hackathon account ❓; the Render API key must stay server-side.

**Fallback:** `DS_JOB_BACKEND=postgres`. The product works the same, and the Render prize is then simply not claimed. Never block a Must item on Render.

---

## 4. Track C: Best Use of APIMatic

### 4.1 What APIMatic offers here

- **Context Plugin** (beta MCP server) that gives a coding agent current PayPal Server SDK context, available for Claude Code and Cursor ✅. Teams that use it and win get 6 months of APIMatic Business ✅ (prize page).
- SDK generation, API docs portal and Context Plugins for **your own** API from an OpenAPI document ✅ (product positioning).
- Judging criteria beyond "use any APIMatic tools" are undisclosed ❓. The install steps for the Context Plugin sit on a resource page that was not readable ❓ (spike S13).

### 4.2 What we do

1. **Use the Context Plugin during development.** Install it into the coding agent (S13), and record in `docs/decisions/apimatic.md` which PayPal calls it helped with. Be honest: whether the PayPal Server SDK covers the Customer Disputes endpoints is ❓; if not, say that the plugin informed the Orders and tracking code and that disputes use our REST client (ADR-005).
2. **Publish a first-class OpenAPI document for `apps/api`.** Already served at `GET /api/openapi.json` (generated from the zod schemas, security schemes, tags, error body). Add:
   - `pnpm openapi:export` writes `docs/openapi.json` from `buildServer()` without starting a network listener;
   - `pnpm openapi:check` fails CI when the committed file is stale;
   - every route has `summary`, `tags`, request and response schemas, and the shared `ErrorBody` (rule in `13-api-service-spec.md` section 10);
   - lint the document with an OpenAPI linter (Spectral or similar) with no errors.
3. **Generate a typed client SDK and a docs portal from that document with APIMatic** (S13: dashboard, CLI or API; the steps are ❓). Commit the generated TypeScript SDK as `packages/api-client` (`@ds/api-client`) and use it in `apps/web`, so the UI really consumes the generated SDK. Keep the generated code unedited and mark it in `.gitattributes` as generated. If generation is not possible in time, fall back to a client generated by `openapi-typescript`/`openapi-fetch` and say so; do not claim APIMatic.
4. **Show it.** README section "APIs and SDKs" with the OpenAPI file, the generated client path, the docs-portal link (if hosted) and a screenshot.

### 4.3 Acceptance

AC-APIM-01 to AC-APIM-04 in `08-acceptance-criteria.md`. Evidence: `docs/openapi.json`, `docs/decisions/apimatic.md`, `packages/api-client`, screenshots.

### 4.4 Risks

Tool access or install steps unavailable (S13); generated SDK style fighting our zod types (keep the client thin; the UI still validates responses with `@ds/schemas` where it matters); time. This is the cheapest track, so it is the first to do and the first to drop.

---

## 5. Track D: Best Use of PayPal + AI (Honorable Mention)

The prize text names no scoring rubric beyond the category ❓. Build the evidence a reader can verify in the repo and the video:

| Claim | Where it is in code | How a judge sees it |
| --- | --- | --- |
| AI does real work on PayPal data | `@ds/agent` drafter turns PayPal-derived facts into evidence prose; Ollama Cloud model | Video: draft appears with citation chips |
| AI is constrained and auditable | `verifyDraft` in `@ds/core`; evals with fabricated claims all rejected | README table of eval results from `pnpm eval`; Verifier ledger widget |
| AI cannot act alone | Approval gate and dry-run default; read-only analyst; read-only copilot tools | `AGENTS.md` rules, tests AC-SUB-*, AC-STUDIO-05 |
| Uses PayPal's own AI tooling | `@paypal/agent-toolkit` read tools in the Case Copilot (`get_dispute`, `get_order`, `get_shipment_tracking`, `list_transactions` ✅ names), with tool results stored and cited | Copilot panel; README section |
| Deep PayPal API use | Disputes v1 (list, get, provide-evidence, accept-claim, make-offer), Transaction Search, Orders v2, tracking, webhooks with verification | `03-paypal-api-contract.md` and fixtures |
| Works without the model | Template fallback; replay mode | `docs` and the e2e suite with `OLLAMA_API_KEY` unset |

The Case Copilot (P3-7) is the piece that uses PayPal's toolkit directly. Compatibility between the toolkit and Ollama's tool-calling is ❓ (S9): the toolkit's documented examples use the Vercel AI SDK, which this build does not use. If that blocks, call the toolkit's tool functions directly (they are plain functions behind the `getTools()` list) and drive the loop with our Ollama client; record the result.

AC-AI-01 to AC-AI-05 in `08-acceptance-criteria.md`.

---

## 6. Effort and cut order (ideal hours; see `07-implementation-plan.md`)

| Item | ih | Cut order if behind |
| --- | --- | --- |
| C: OpenAPI export + check + lint | 2 | keep (cheap, also helps Technological Implementation) |
| C: APIMatic SDK + portal + Context Plugin notes | 3 | drop first among tracks; fall back to `openapi-typescript` |
| B: Render handlers wired + Blueprint deployed + cron | 5 | drop if S11 fails; `postgres` backend stays |
| A: theme + layout + data endpoints | included in P3-4 and P3-5a | keep a plain Studio dashboard |
| A: Deadline runway widget | 4 | keep this one |
| A: Verifier ledger widget | 3 | drop to a value/grid widget |
| A: Dispute analyst + proxy adapter | 5 | drop analyst last; it is the Agent Framework evidence |
| D: Case Copilot | 4 | drop before the others (already "only if on schedule") |

## 7. What not to claim

No tool the build does not use; no judging criterion that was not read; no "winner", "likely" or percentage anywhere; no statement that the generated SDK is APIMatic's unless it is; no claim that Render runs the pipeline unless the demo shows a task run.
