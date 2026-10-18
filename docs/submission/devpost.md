# Devpost text (draft)

Source for the Devpost form (`docs/10-demo-and-submission.md` section 4). Every claim here is checkable in the repo. Items in **[brackets]** wait on something not done yet; delete the section if it never happens. Re-read before submitting.

**Title:** Dispute Shield

**Tagline:** Answer every PayPal dispute on time, with evidence you can prove, and stop the next one before it starts.

## Inspiration

Small online sellers get PayPal disputes with a short response window. The facts they need are spread across PayPal, the shipping record and their own spreadsheet, and a wrong or missing detail can cost the case. Many disputes also trace back to gaps that were visible earlier: no tracking on PayPal, a shipping address that does not match, an unprotected payment.

Our user is the owner of a small shop (the demo is Hearthside Ceramics) who answers disputes alone, between other work.

## What it does

Dispute Shield is an open-source dispute desk with two halves.

**Respond.** It syncs disputes from PayPal and puts the nearest deadline first, with the amount at risk and an evidence-strength badge. For each dispute it builds a case file of facts, each with its source: PayPal's dispute, transaction and order records, plus the seller's fulfilment CSV. A fixed checklist per dispute reason scores strength (a checklist, not a prediction). An LLM drafts the response, and every sentence must cite facts. A deterministic verifier then checks each sentence: cited facts must exist, and every date, amount, ID, tracking number and carrier in the text must match them. It also blocks claims the records cannot back, such as "the buyer confirmed receipt", and text that reads as an instruction. Rejected sentences are removed and shown with the reason. The owner sees a decision aid (fight, accept or review, and why), reviews the exact request that would go to PayPal, ticks a confirmation and approves. Nothing is sent without that approval, and the demo runs in dry-run mode, which stores the request instead of sending it.

**Prevent.** A risk scan flags orders paid long ago with no tracking, address mismatches and payments without seller protection. The owner can add tracking or refund from the flag, again with a preview first.

**Ask.** A read-only Case Copilot answers questions such as "What is missing?" from the case facts and the evidence checklist. It can re-read the dispute, order or transaction from PayPal with read-only tools. Its answers go through the same fact check as the drafts.

A Health page shows deadlines, verifier results and pipeline status, and every action is in an exportable audit log. Each case can be downloaded as a PDF evidence packet with the statements and a citation appendix.

## How we built it

- Turborepo monorepo in TypeScript, pnpm, exact pinned dependencies.
- **API:** Fastify 5 with an OpenAPI 3.0 document checked in CI; cookie session behind an access code, rate-limited login, CORS allow-list, scrubbed logs.
- **Web:** Next.js and React. It holds no secrets and talks only to our API through a typed client. Grids use AG Grid.
- **Data:** Postgres (Supabase for hosting, Docker locally) with Drizzle; row-level security on every table; money stored as integer minor units.
- **PayPal gateway** with a live adapter and a replay adapter that serves recorded sandbox responses, so the demo runs without credentials and is labelled as recorded.
- **Jobs:** collect and draft run as background jobs on a Postgres queue; the same handlers are packaged as Render Workflows tasks.
- **AI:** Ollama Cloud (`gemma4:31b`). The model sees a list of facts, never raw PayPal payloads or buyer details. The cloud API has no structured-output mode, so we pull the JSON object out of the reply, validate it with zod, repair once, and fall back to a plain template. The verifier gates every path, including human edits. Without an AI key, the demo shows a draft recorded from the real model, labelled "Recorded model output", and still verified against the current facts.

## How PayPal is used

All calls are to the sandbox.

- **Disputes API:** list, details, provide-evidence (multipart, with a file part), accept-claim.
- **Webhooks:** `CUSTOMER.DISPUTE.*` events with signature verification (`verify-webhook-signature`), stored idempotently; each event triggers a fresh read of the dispute, so out-of-order events are safe. Polling every five minutes is the source of truth, because the sandbox did not emit real dispute events in our tests.
- **Transaction Search:** shipping details, protection eligibility and item names for each case file and for the risk scan.
- **Orders v2:** order details and add-tracking.
- **Payments v2:** refund a capture.
- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`, OpenAI-format tools driven by our own Ollama loop): the Case Copilot's read tools `get_dispute`, `get_order`, `get_shipment_tracking` and `list_transactions` in live mode. Each result is stored and converted to facts before the model sees it. Replay mode serves the same tools from recorded data.

Day-0 spike results against the sandbox are in `docs/decisions/0001-day0-spike-results.md`.

## Where the AI is used, and where it is blocked

- **Used:** drafting the evidence statements and the recommendation rationale; answering the owner's questions in the Case Copilot.
- **Blocked:**
  - The verifier removes any sentence that cites nothing, cites a fact that does not exist, states a value that differs from the fact, claims something the records cannot show, or reads as an instruction.
  - The model never chooses whether to send: a person approves the exact request.
  - The Copilot has only read tools and its answers pass the same value check, or are replaced with "I could not verify that answer".
  - It never sees raw payloads or personal data.
  - The UI never states a chance of winning.
- **Measured:** the verifier passes 16 true statements and rejects 15 adversarial ones in CI, including an invented tracking number, a wrong date, a fake carrier, "buyer confirmed receipt" and prompt injection. A live run on 2026-10-18 (`docs/evals/2026-10-18.md`) with `gemma4:31b`, five runs per draftable demo case plus a prompt-injection variant, gave:
  - first-try valid JSON: 15/15;
  - accepted after at most one repair: 15/15;
  - injected instructions accepted: 0;
  - fabricated claims in a manual read: none.

## Challenges

- Creating sandbox disputes at all: it needed a separate buyer account, real checkout payments and then opening disputes as that buyer.
- Provide-evidence wants a multipart body with a file part, and the sandbox rejects the `OTHER` carrier.
- Dispute webhooks never arrived from the sandbox for real disputes, so we made polling the source of truth and kept the verified webhook route.
- Making the AI accountable. The first live eval sent every DS-001 draft to the template, because a verifier rule was too strict on a true "shipped to" statement. Writing adversarial cases also found claims it let through ("refunded" when the record said no refund). Both are fixed and covered by tests.

## Accomplishments

- End-to-end flow from PayPal data to a verified, cited draft and an approved request, shown as the exact stored request.
- The verifier rejects every case in our adversarial set, in CI.
- 17 Playwright tests drive the real UI in replay mode, including accessibility checks on seven pages and a phone-width layout.

## What we learned / what's next

- An LLM is useful here only with a checker that does not trust it; the checker is most of the work.
- Next: sign-in for many merchants through PayPal OAuth, more dispute reasons, carrier tracking integrations, and the AG Studio analyst (see below).

## Sponsor tools

- **AG Grid:** the dispute queue, risk radar, audit log and fulfilment table.
- **[AG Studio]:** **[not yet: our AG Studio trial starts on or after 1 Nov. The Health page currently uses the fallback dashboard (React views and AG Grid). Fill in only what ships.]**
- **[Render]:** **[the Workflows tasks are written (`apps/workflows`) but not deployed. Add this section only after the hosted deploy and a recorded run.]**
- **[APIMatic]:** **[not used yet. Delete unless the SDK or portal is really generated.]**

## Limits

- Sandbox only. Drafts evidence for item-not-received and refund cases; other reasons get a fact packet and an accept-claim option.
- Strength is a checklist result, not a prediction.
- Transaction Search data can be up to 3 hours old.
- The sandbox did not send real dispute webhooks, so polling drives updates.

## Built with

TypeScript, Node.js, Fastify, Next.js, React, Turborepo, pnpm, PostgreSQL, Supabase, Drizzle, zod, Ollama Cloud, PayPal REST APIs, PayPal Agent Toolkit, AG Grid, OpenAPI, Playwright, Vitest. **[Add AG Studio, Render and APIMatic only if used.]**

## Links

- Repo: **[GitHub URL]**
- Hosted demo: **[URL]**
- Video: **[YouTube URL]**

## Testing instructions

- **Hosted:** **[URL]**, access code **[code]**. The hosted demo runs on recorded sandbox data, marked "Replay data" in the header. The API may take about a minute to wake after idle.
- **Local (replay, no credentials):** the five commands in the README quickstart.
- **90-second path:**
  1. Sign in and open DS-001.
  2. Click a citation chip to see its source.
  3. Click **Approve & send evidence**, tick the box and click **Store (dry run)**.
  4. Open **Risk**, click **Scan now** and open a flag to preview **Add tracking**.
  5. Open **Health**.
- **Live sandbox:** "Going live in the sandbox" in the README.

## Prize selections

One Grand Prize or Honorable Mention track plus at most one sponsor prize (rules). Primary sponsor target: see `docs/14-prize-tracks.md`. **[Confirm once the sponsor sections above are final.]**
