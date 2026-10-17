# 06. UI spec

Stack: Next.js App Router, React 19, Tailwind 4, AG Grid Community 36.x for tables, AG Studio 3.x for the Health dashboard (versions from PayPal's starter, see `02-monorepo-structure.md`). Components live in `packages/ui`; pages in `apps/web/src/app`. The web app is UI only: all data comes from `apps/api` through `packages/api-client` (same-origin `/api/*` rewrite), and it holds no secrets (`architecture.md` ADR-013, ADR-015).

User: the owner or ops person of a small online shop. They are not a PayPal expert, are busy, and are afraid of a deadline. Design for "what do I do in the next five minutes?".

## 1. Design principles

1. **Deadline first.** Every screen that lists disputes sorts by urgency and shows time left.
2. **Show the source.** Every claim in a draft has a citation chip; clicking it opens the underlying record snippet.
3. **Say what will happen.** Before any send, show the exact request. Mode banner always visible.
4. **Never promise.** No percentages, no "likely to win". Use the strength badge with its checklist.
5. **Calm, plain words.** "Evidence missing: tracking number", not "Validation failure".
6. **Keyboard and screen-reader friendly.** Focus order, labels on icon buttons, colour never the only signal.
7. **Works at laptop width first**; usable on a phone for reading and approving (judges may open on mobile).

## 2. Global shell

- Top bar: product name, nav (Disputes, Risk, Health, Fulfilment, Audit, Setup), time zone chip, mode banner.
- **Mode banner** (`ModeBanner`): always visible, two chips:
  - Data: `REPLAY (recorded sandbox data)` or `LIVE SANDBOX`
  - Submit: `DRY RUN` or `SENDS TO SANDBOX`
  Colour and text both change; tooltips explain. Production is never shown because it does not exist.
- Deadline ticker: shows the nearest deadline across open cases ("Next deadline: DS-002 in 5 h 12 m").
- Toasts for async results (sync done, draft ready, submission result).
- Login screen: one field for the access code (`DS_DEMO_ACCESS_CODE`), posted to `/api/auth/login`; the API sets a signed `ds_session` cookie. "Demo data only" notice. A 401 from any call sends the user back to login with their place remembered.
- Empty state for first run: "No disputes yet. Click Sync now or load demo data" (the latter only in replay mode).

## 3. Screen: Dispute Queue (`/disputes`)

Purpose: see what needs action and open a case.

Layout: summary strip above an AG Grid table.

Summary strip (cards): `Needs action` count, `Due within 24 h`, `Amount at risk` (sum by currency), `Submitted, awaiting outcome`.

Grid columns:

| Column | Notes |
| --- | --- |
| Time left | `Countdown` cell; red under 24 h, amber under 72 h, grey when none; default sort ascending |
| Dispute | ID, monospace, link to case |
| Reason | human label |
| Amount | `MoneyAtRisk` |
| Stage | Inquiry / Chargeback / … |
| Evidence strength | `StrengthMeter` badge (STRONG, MEDIUM, WEAK, or "Not assessed") with tooltip showing checklist |
| Case state | pill (Needs info, Ready, Submitted, …) |
| Recommended | Fight / Accept / Review |

Behaviour:
- Quick filter text box, filter chips for state and reason, saved in the URL query string.
- Row click opens the case workspace. Row action menu: Open, Re-collect, Accept claim (if allowed).
- "Sync now" button enqueues `sync_disputes` and shows last-synced time; the grid refreshes when the job finishes (poll `/api/health` or revalidate).
- Pagination server-side beyond 500 rows; otherwise client-side.
- Column state (order, width) in `localStorage` guarded by try/catch.
- Empty, loading (skeleton rows) and error states are specified, not left to defaults.

## 4. Screen: Case Workspace (`/disputes/[id]`)

Purpose: understand one dispute, review the drafted evidence, approve, send.

Three-column layout at desktop, stacked on mobile. Header with dispute ID, reason, amount, stage, PayPal status, countdown, and mode banner repeated near the action buttons.

### Left column: Case file

- **Facts list** grouped: Dispute, Payment, Shipping, Refund, Seller records. Each fact row: label, display value, source tag (`PayPal`, `Your file`, `Derived`), and a "view source" action opening `FactDrawer` with the raw JSON snippet at `jsonPath`.
- **Checklist**: items with MET / MISSING / CONFLICT icons and text. Clicking a MISSING item shows how to fix it ("Upload your fulfilment CSV" with a link to `/fulfilment`).
- **Needs info** panel (state `NEEDS_INFO`): what is missing, who can supply it, "Re-collect" button.

### Centre column: Evidence draft

- **Decision panel** at top: recommendation (Fight / Accept / Review), `StrengthMeter`, "because" bullets, amount at risk, time left, blockers. A "How this is decided" disclosure shows the rubric from `05-evidence-engine-spec.md` sections 3 and 6.
- **Draft statements**: each sentence with citation chips (`CitationChip`, text like `tracking.number`). Hover or focus highlights the related fact on the left. Rejected statements by the verifier appear in a collapsed "Removed by verifier (n)" list with reason.
- **Origin line**: "Drafted by <model> (prompt drafter.v1)" or "Plain template (AI unavailable)".
- **Editing**: the owner can delete a statement or edit its text. Any edit re-runs the verifier immediately (client calls `/api/disputes/[id]/draft` with `mode: "verify"`); a failing edit shows the reason inline and keeps the previous passing version as the approvable one.
- **Version history**: drafts v1, v2… with origin and verifier result; selecting one shows it read-only.
- **Verifier summary**: "n of m statements verified". A green "Verified" badge appears only when `verifier_passed`.

### Right column: Actions and history

- **Primary actions** (disabled with a reason when blocked):
  - `Approve & send evidence` (fight path)
  - `Accept claim and refund` (accept path; opens a confirm dialog that states the amount)
  - `Regenerate draft`
  - `Download evidence packet (PDF)` (should-have)
- **Approve flow**: opens a review modal showing the exact outbound request (`request_snapshot` preview: evidence type, tracking info, notes text, attached files), the mode banner, and a checkbox "I have read this and approve it". The confirm button reads "Store (dry run)" or "Send to sandbox" depending on mode.
- **Result**: after submit, show the submission row (status, PayPal response summary, `debug_id` if any), and the case moves to `SUBMITTED`.
- **Timeline**: case events from `audit_log` and PayPal status changes, newest first.
- **Case Copilot** (should-have): collapsible chat. Suggested prompts: "What is missing?", "Is the address consistent?", "Explain the deadline". Answers show citation chips; failed verification shows the fallback sentence.

### States to design explicitly

`COLLECTING` (progress with steps: fetching dispute → payment → order → seller file), `NEEDS_INFO`, `READY`, `APPROVED` (brief), `SUBMITTED`, `AWAITING_OUTCOME`, closed states (outcome banner: won, lost, accepted), `EXPIRED` (read-only, explains what was missed), `ERROR` (message plus retry).

## 5. Screen: Risk Radar (`/risk`) — Prevent

Purpose: find orders with gaps before they become disputes.

- AG Grid of open `risk_flags`: severity, rule, order/transaction, amount, age, reason sentence, suggested action.
- Row detail panel (master/detail or drawer): facts used by the rule (with source tags), "Why this matters" one-liner, and action buttons.
- Actions:
  - `Add tracking` → modal prefilled from CSV; shows request preview; confirm text per mode.
  - `Refund` → modal with amount field (full/partial), typed confirmation of amount, request preview.
  - `Dismiss` → reason dropdown (Handled elsewhere, Not a risk, Test order).
- "Scan now" button (`POST /api/risk/scan`), "Data may be up to 3 hours old" note with `fetched_at` of the newest transaction ✅ (Transaction Search latency).
- Thresholds panel (read-only here, editable on Setup) states they are assumptions.
- Empty state: "No gaps found in the last N days".

## 6. Screen: Health dashboard (`/health`) — AG Studio

Purpose: show the owner how disputes are trending, and be the AG Studio showpiece for the AG Grid prize track. Judged on custom widgets, theming and layout, and use of the Studio Agent Framework ✅. Implementation specs (data sources, widgets, theme, analyst, adapter, tests) are in `14-prize-tracks.md` section 2; this section is the design.

Library usage: `import { AgStudio, createWidgets } from 'ag-studio-react'`; `<AgStudio data={...} mode="view" theme={...} widgets={...} components={...} ai={...} />`. Types read from the 3.0.0 packages ✅; licence mechanism and custom widget behaviour are settled in spike S10.

Data sources (arrays of plain objects from `GET /api/analytics/:source`, no PII, money in minor units): `disputes`, `evidence_items`, `statements`, `risk_flags` (columns in `14-prize-tracks.md` 2.3 and `04-data-model.md` 2.12a).

Default layout (view mode for judges; an Edit toggle switches to `edit`):
1. Top row, three value widgets: open disputes, money at risk (one per currency), due within 24 h.
2. Middle, full width: **Deadline runway** (custom widget 1). Horizontal timeline of open disputes from now to +14 days. Mark position = response deadline, size = amount, colour and shape = strength. Overdue and under-24-hour marks use a different shape and a text label, never colour alone. Click opens the case.
3. Lower left: **Verifier ledger** (custom widget 2). Statements drafted, accepted, rejected by reason (`NO_CITATION`, `UNKNOWN_FACT`, `VALUE_MISMATCH`, `TOO_LONG`), and the share of drafts that passed first time. Shows the AI is accountable.
4. Lower right: AG Grid of disputes by urgency (reuses the queue columns).
5. Optional (if time): disputes by reason (bar), flags opened vs resolved (line), strength distribution.
6. **Theme:** built from `tokens.css` (colour, radius, font, spacing) for light and dark, so the dashboard matches the app.
7. **Dispute analyst** chat panel (Studio Agent Framework). Read-only; prompt starters: "What is due soonest?", "What is blocking drafts?", "Money at stake", "Where do disputes come from?". Answers cite the query they ran. When no model is configured the panel says so plainly ("No language model is connected in this demo") instead of pretending.

States to design: loading (skeleton), no data (EmptyState with a link to load demo data in replay mode), analyst busy (429 from the one-request free tier: "The analyst is busy, try again in a few seconds"), analyst signed out (401: link to login), analyst failed (plain message, panel stays usable).

Fallback if AG Studio, its licence or the custom-widget API blocks: render the same widgets as React components with AG Grid Community and a small chart component, keep the route, and note it in the README. The chat then moves to a plain side panel using the same proxy. Decision point in Phase 3 (`07-implementation-plan.md`).

## 7. Screen: Fulfilment (`/fulfilment`)

- Drag-and-drop CSV upload with a sample file download and column documentation.
- Validation result summary: imported rows, skipped rows with line numbers and reasons.
- AG Grid table of records with search; each row shows whether it matches a known transaction.
- Replace behaviour is explained: re-importing a transaction ID replaces the row.
- "Fulfilment data is your record; PayPal tracking is the authority" note.

## 8. Screen: Audit (`/audit`)

- AG Grid of `audit_log`: time, actor, action, dispute/flag link, detail summary. Filters by action and actor. Export CSV button.
- Read-only.

## 9. Screen: Setup & Health (`/setup`)

- Mode panel (from `GET /api/health` and `GET /api/settings`): data mode, submit mode, PayPal env (always Sandbox), app ID (masked), webhook ID (masked), last webhook received, last sync, job backend (`postgres` or `render`), LLM (Ollama Cloud, model name, reachability), database status (Supabase), version/commit. Recent job outcomes with the Render run id when the backend is `render`.
- Connection tests: "Test PayPal auth", "Send test webhook" (replay mode posts a fixture), "Test LLM".
- Webhook URL to copy and the exact steps to register it in the PayPal developer dashboard with the three dispute events.
- Thresholds editor (`R-*` values) with the label "These are assumptions you can change".
- Verifier stats (rolling 24 h) per `05-evidence-engine-spec.md` section 10.
- Danger zone: none (no destructive actions in the demo).

## 10. Component inventory (`packages/ui`)

| Component | Props (essentials) | Notes |
| --- | --- | --- |
| `ModeBanner` | `dataMode`, `submitMode` | always rendered in shell |
| `Countdown` | `dueAt`, `now?` | updates every 30 s, text like `5 h 12 m`, `Overdue` |
| `MoneyAtRisk` | `minor`, `currency` | uses `Intl.NumberFormat` |
| `StrengthMeter` | `strength`, `checklist` | three-segment bar with text, tooltip lists items |
| `CitationChip` | `factKey`, `onOpen` | focusable, opens `FactDrawer` |
| `FactDrawer` | `fact`, `payload`, `jsonPath` | shows highlighted JSON excerpt |
| `Badge`, `Button`, `Card`, `Drawer`, `EmptyState`, `Toast` | basic | tokens only, no hard-coded colours |
| `QueueGrid`, `RiskGrid`, `AuditGrid` | rows, callbacks | wrap AG Grid with the shared theme |
| `DisputeHealthStudio` | `data`, `mode`, `apiBaseUrl` | wraps AG Studio; registers the custom widgets, theme and the Dispute analyst harness |
| `DeadlineRunwayView`, `VerifierLedgerView` | rows | pure React views used by the Studio widgets; unit-tested without Studio |

## 11. Visual language

- Tokens in `tokens.css`: neutral surface scale, one accent, semantic colours (ok, warn, danger, info), 4 px spacing scale, radius 8, type scale 12/14/16/20/28, system font stack with tabular numerals for money and countdowns.
- Light and dark themes via `prefers-color-scheme` with a manual toggle; AG Grid and AG Studio themes derive from the same tokens.
- Urgency colours: danger under 24 h, warn under 72 h; always paired with text ("Due in 5 h").
- Icons: one set (for example lucide), each with an accessible name.
- Motion: minimal; respect `prefers-reduced-motion`.

## 12. Accessibility and quality bar

- WCAG 2.2 AA contrast; focus-visible styles; all grids reachable by keyboard (AG Grid keyboard navigation enabled) ⚠️ verify in S10.
- Forms have labels and error messages tied by `aria-describedby`.
- Modals trap focus and return it on close.
- No layout shift on countdown updates (fixed-width numerals).
- Lighthouse accessibility ≥ 90 on `/disputes` and `/disputes/[id]` in replay mode (acceptance criterion AC-UI-06).

## 13. Copy rules

- Use "dispute", "evidence", "deadline", "refund". Avoid "chargeback" unless PayPal's stage says so.
- Never write "you will win", "likely", "chance", "guaranteed".
- Error messages say what happened, what is safe, and what to try ("PayPal didn't accept the evidence: <short reason>. Nothing was changed on your side. Review and try again.").
- Everything the AI wrote is labelled as AI-drafted until the owner approves it.

## 14. Demo-critical details

- The first screen after login in replay mode must already show the four demo disputes sorted by urgency, one at "URGENT".
- DS-001 must load a draft in under two seconds from stored results (pre-generated draft stored in fixtures; "Regenerate" calls the model).
- The approve modal's exact-request preview and the dry-run result must be visible without scrolling at 1280×720.
- Dark theme must not be broken in AG Grid or AG Studio (judges may use dark mode).
