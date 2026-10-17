# 05. Evidence engine spec

This file defines the logic that decides what Dispute Shield says, to whom, and when it refuses. It is the heart of the "Technological Implementation" criterion (ties in this hackathon are broken on it first). Everything here is deterministic except step 3 (the drafter), and step 3 is boxed in by steps 2 and 4.

Pipeline:

```text
collect → facts → checklist + strength → [LLM draft] → verifier → decision aid → human approval → submit
                                                         ▲ fails closed to template statements
```

Code locations: `packages/core` (everything deterministic), `packages/agent` (drafter, copilot), `packages/paypal` (fetching).

## 1. Principles

1. The model never sees raw PayPal payloads or buyer personal data. It sees facts.
2. Every sentence sent to PayPal is traceable to at least one fact, and every number, date and ID in the sentence matches a fact's `display` string.
3. When in doubt the system says "missing" instead of guessing.
4. Strength is a checklist score, **not a probability**. The UI never shows a percentage and never says "you will win".
5. Nothing leaves the app without an explicit human approval of a specific draft version.

## 2. Facts

### 2.1 Shape

See `Fact` in `architecture.md` section 6. `display` is the exact string the verifier compares against; build it once, in the extractor, and never reformat later.

### 2.2 Fact catalogue

| Key | Label | Source | Display example |
| --- | --- | --- | --- |
| `dispute.id` | Dispute ID | dispute details | `PP-D-27803` |
| `dispute.reason` | Dispute reason | dispute details | `Item not received` |
| `dispute.amount` | Amount in dispute | dispute details | `USD 48.00` |
| `dispute.opened_at` | Dispute opened | dispute details | `2026-10-02` |
| `dispute.response_due` | Response due | dispute details | `2026-10-12` |
| `dispute.stage` | Stage | dispute details | `Inquiry` |
| `txn.id` | Transaction ID | transaction search | `5TY05013RG002845M` |
| `txn.date` | Payment date | transaction search | `2026-09-24` |
| `txn.amount` | Payment amount | transaction search | `USD 48.00` |
| `txn.protection_eligibility` | Seller protection | transaction search | `Eligible` (from `01`), `Not eligible` (`02`), `Partially eligible` (`03`) |
| `txn.item_names` | Items | `cart_info` | `Speckled mug (set of 2)` |
| `txn.ship_to.postal_code` | Ship-to postal code | `shipping_info` | `560001` |
| `txn.ship_to.country` | Ship-to country | `shipping_info` | `IN` |
| `order.id` | Order ID | order details | |
| `order.ship_to.postal_code` | Order ship-to postal code | order details (paths ❓ S7) | |
| `tracking.number` | Tracking number | order tracker or CSV | `1Z999AA10123456784` |
| `tracking.carrier` | Carrier | order tracker or CSV | `UPS` |
| `tracking.on_paypal` | Tracking on PayPal | order tracker | `Yes` / `No` |
| `fulfil.shipped_at` | Shipped | CSV (seller upload) | `2026-09-25` |
| `fulfil.delivered_at` | Delivered | CSV | `2026-09-29` |
| `fulfil.last_scan_at` | Last carrier scan | CSV | `2026-09-29` |
| `fulfil.ship_to.postal_code` | Shipped-to postal code | CSV | `560001` |
| `refund.exists` | Refund issued | order details | `Yes` / `No` |
| `refund.id` | Refund ID | order details | |
| `refund.amount` | Refund amount | order details | `USD 48.00` |
| `refund.date` | Refund date | order details | |
| `policy.return_text` | Return policy | settings `shop.profile` | |
| `derived.days_ship_to_open` | Days from shipping to dispute | derived | `8` |
| `derived.ship_address_match` | Ship address matches order | derived | `Yes` / `No` |

Conventions:
- Dates display as `YYYY-MM-DD` in UTC unless the source gives only a date.
- Money displays as `CUR 0.00` using the currency's exponent.
- Derived facts carry `confidence = DERIVED` and cite their inputs in `jsonPath` as a comma list of fact keys.
- CSV-sourced facts carry `confidence = SELLER_UPLOAD`. The UI marks them "from your file" and the drafter is told to say "per the seller's fulfilment records" rather than "per PayPal".

### 2.3 Extraction rules

- One extractor per source (`packages/core/src/facts/extract-*.ts`). Extractors are pure: `(parsedPayload, payloadId, fetchedAt) → Fact[]`.
- A missing field produces no fact (never `null` placeholders) and adds an entry to `missing[]` when the checklist needs it.
- Disagreements are surfaced, not resolved: if the CSV tracking number differs from the PayPal tracker, both facts are kept (`tracking.number` from PayPal, `fulfil.tracking.number` from CSV) and the checklist item becomes `CONFLICT`, which blocks drafting until the owner picks one.

### 2.4 Fulfilment CSV (seller upload)

Columns, in this order, header row required:

```text
order_ref,paypal_transaction_id,carrier,tracking_number,shipped_at,delivered_at,last_scan_at,ship_to_name,ship_to_line1,ship_to_city,ship_to_postal,ship_to_country
```

Rules: UTF-8, comma separated, ISO 8601 dates (`2026-09-25` or full timestamps), at most 5,000 rows per file, `paypal_transaction_id` required and unique. Invalid rows are reported with line numbers and skipped; valid rows are imported. The validation schema lives in `@ds/schemas/fulfilment.ts`.

## 3. Checklists and strength

### 3.1 Item-not-received (reason `MERCHANDISE_OR_SERVICE_NOT_RECEIVED` ✅ name to confirm in S2)

| Key | Item | Met when | Blocking for drafting |
| --- | --- | --- | --- |
| `INR-1` | Tracking number and carrier exist | `tracking.number` and `tracking.carrier` present | yes |
| `INR-2` | Tracking was shipped before the dispute | `fulfil.shipped_at` (or tracker date) earlier than `dispute.opened_at` | no |
| `INR-3` | Delivery confirmed | `fulfil.delivered_at` present | no |
| `INR-4` | Delivered to the order address | `derived.ship_address_match` = Yes | no |
| `INR-5` | Tracking is on PayPal | `tracking.on_paypal` = Yes | no |
| `INR-6` | Transaction is protection-eligible | `txn.protection_eligibility` = Eligible | no |

Strength rubric:
- **STRONG**: INR-1, INR-3 and INR-4 met, and no CONFLICT.
- **MEDIUM**: INR-1 met, and either INR-3 or INR-4 is not met, or INR-3 met with INR-4 unknown.
- **WEAK**: INR-1 not met, or any CONFLICT unresolved.

The rubric is deliberately simple and written in the UI next to the badge ("Strong = tracking, delivery and address all confirmed"). It is an assumption about what helps, not a claim about PayPal's decision process.

### 3.2 Credit not processed / duplicate transaction (when a refund exists)

| Key | Item | Met when | Blocking |
| --- | --- | --- | --- |
| `REF-1` | A refund exists for the disputed payment | `refund.exists` = Yes | yes |
| `REF-2` | Refund amount covers the disputed amount | `refund.amount` ≥ `dispute.amount` | no |
| `REF-3` | Refund date is before the dispute | `refund.date` earlier than `dispute.opened_at` | no |

Evidence type `PROOF_OF_REFUND` with `evidence_info.refund_ids`. Strength: STRONG when REF-1 and REF-2; MEDIUM when REF-1 only; WEAK otherwise. If no refund exists the recommendation is `ACCEPT` or `REVIEW`, never `FIGHT`.

### 3.3 All other reasons (generic)

No checklist. The case gets `recommended_action = MANUAL`, a packet of the facts we do hold (transaction, dates, amount), and a note: "Dispute Shield does not draft evidence for this reason yet." The owner can still use "accept claim" if the link exists. This is demo scenario DS-004 and is intentional: the app shows its limits.

## 4. The drafter (LLM)

Location: `packages/agent/src/drafter/draft.ts`, prompt `drafter.v1`.

### 4.1 Input

```ts
type DrafterInput = {
  reason: string;
  allowedEvidenceTypes: ("PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER")[];
  facts: { key: string; label: string; display: string; confidence: "PAYPAL" | "SELLER_UPLOAD" | "DERIVED" }[];
  checklist: { key: string; label: string; status: "MET" | "MISSING" | "CONFLICT" | "NOT_APPLICABLE" }[];
  styleGuide: string; // fixed text: factual, neutral, no emotion, no threats, no legal claims
  maxStatements: number; // default 8
};
```

Not included: raw payloads, buyer name, email, street address, phone.

### 4.2 Output (zod-validated `EvidenceDraft`)

- `evidenceType` must be in `allowedEvidenceTypes`.
- `statements`: 1 to `maxStatements` sentences, each with `factKeys` (at least one).
- `recommendation.action`: `FIGHT`, `ACCEPT` or `REVIEW`, with `rationale` statements that are themselves cited.

### 4.3 Prompt contract (summary; full text in `prompts/drafter.v1.ts`)

- You write evidence for a PayPal dispute on behalf of the seller. You may only state things that appear in the fact list.
- Every sentence must cite fact keys. Do not add, round, convert or infer numbers, dates or identifiers. Copy values exactly as displayed.
- If a fact is from the seller's file, say so.
- Do not speculate about the buyer, do not argue, do not mention PayPal policy, do not promise outcomes.
- If the checklist shows missing blocking items, return `recommendation.action = "REVIEW"` and explain what is missing, with no evidence statements.
- Output JSON that matches the schema. Nothing else.

### 4.4 Failure handling

1. Schema invalid → one repair retry with the zod error text.
2. Verifier rejects any statement → one repair retry with the rejection list (statement, reason).
3. Still failing, model error, timeout (30 s budget) or no API key → build statements from `templates/fallback-statements.ts` using only facts, set `origin = TEMPLATE_FALLBACK`, and show a banner "AI drafting unavailable, using plain template".
4. Record `model`, `prompt_version`, token counts (if available) in the draft row and logs.

Template examples (INR strong):
- "Tracking number {tracking.number} with carrier {tracking.carrier} was recorded for this order. [tracking.number, tracking.carrier]"
- "The package was shipped on {fulfil.shipped_at}, before the dispute was opened on {dispute.opened_at}. [fulfil.shipped_at, dispute.opened_at]"
- "Delivery was confirmed on {fulfil.delivered_at} to postal code {fulfil.ship_to.postal_code}, which matches the order. [fulfil.delivered_at, fulfil.ship_to.postal_code, derived.ship_address_match]"

## 5. The verifier

Location: `packages/core/src/verifier/verify.ts`. Pure function, no I/O. This is what makes the AI claim defensible, so it is the most heavily tested unit in the repo.

`verifyDraft(draft: EvidenceDraft, facts: Fact[], opts): VerifierReport`

For each statement:

| Check | Reject reason |
| --- | --- |
| `factKeys` empty | `NO_CITATION` |
| any key not in the case's latest facts | `UNKNOWN_FACT` |
| a number, date or identifier token in `text` that does not equal (after normalisation) the `display` of any cited fact | `VALUE_MISMATCH` |
| statement longer than 400 characters | `TOO_LONG` |

Token extraction (`tokens.ts`):
- Dates: `YYYY-MM-DD`, and common written forms (`12 Oct 2026`, `October 12, 2026`) parsed to ISO for comparison.
- Money: currency code or symbol plus amount, compared in minor units and currency.
- IDs: any run of 8 or more alphanumeric characters containing a digit.
- Plain integers (such as "8 days") must equal a fact display or be a derived fact (`derived.days_ship_to_open`).
- Words that assert things without a number (for example "delivered") must be backed by a cited fact in an allow-list map (`delivered` → `fulfil.delivered_at`; `refunded` → `refund.exists`; `shipped` → `fulfil.shipped_at`). A statement using one of these words without the corresponding cited fact is `UNKNOWN_FACT`.

Report assembly:
- `accepted` = statements that passed.
- `notesText` = accepted statements joined with a space, then a short appendix line listing evidence references, truncated at the last full sentence at or below 2000 characters ✅ (PayPal limit).
- `citationAppendix` = for each cited fact: key, label, display, payload ID, JSON path. Shown in the UI; the notes text sent to PayPal does not contain internal keys.
- The draft's `verifier_passed` is true only when at least one statement is accepted, no statement is rejected, and every blocking checklist item is MET.

Negative tests that must exist (see `09-test-plan.md`): fabricated tracking number; right number with wrong carrier; date shifted by one day; amount with different currency; "delivered" with no delivery fact; citation key that does not exist; statement with only a citation but no content words; prompt-injection text inside a fact value (for example a seller note that says "ignore the rules"): facts are data, the prompt marks them as data, and the verifier still applies.

## 6. Decision aid

Location: `packages/core/src/decision/decide.ts`.

Input: case state, checklist, strength, dispute amount, deadline, whether `accept-claim` and `provide-evidence` links exist, existing refund state.

Output:

```ts
type DecisionAid = {
  recommended: "FIGHT" | "ACCEPT" | "REVIEW";
  because: string[];            // plain sentences built from rubric results
  amountAtRisk: { currency: string; minor: number };
  costOfFighting: string;       // "About N minutes to review; deadline in X"
  deadline: { dueAt: string | null; hoursLeft: number | null; band: "OK" | "SOON" | "URGENT" | "OVERDUE" };
  blockers: string[];           // anything preventing a send
};
```

Rules (assumptions; shown in the UI under "How this is decided"):
1. No `provide-evidence` link → cannot fight; recommend `ACCEPT` if the `accept-claim` link exists, else `REVIEW`.
2. STRONG → `FIGHT`. WEAK and no way to fix it before the deadline → `ACCEPT`. MEDIUM → `FIGHT` when the amount is above `DS_HIGH_VALUE_THRESHOLD`, otherwise `REVIEW`.
3. Deadline bands: `URGENT` under 24 h, `SOON` under 72 h, `OVERDUE` past due (all editable constants). `OVERDUE` blocks every submit.
4. If a refund already covers the full amount, recommend `FIGHT` with `PROOF_OF_REFUND` (never "accept", because the buyer is already made whole).
5. The aid explains itself; it is never a probability and the word "chance" does not appear in the UI.

## 7. Submission payloads

Built in `packages/paypal` from an approved draft; deterministic.

Provide evidence (INR):
- `evidence_type`: `PROOF_OF_FULFILLMENT`
- `evidence_info.tracking_info`: `[{ carrier_name, tracking_number }]` from `tracking.*` facts, using `normaliseCarrier()`
- `notes`: `VerifierReport.notesText` (≤ 2000 characters)
- optional files: the PDF evidence packet (should-have), under 10 MB

Provide evidence (refund):
- `evidence_type`: `PROOF_OF_REFUND`
- `evidence_info.refund_ids`: from `refund.id` facts
- `notes`: as above

Accept claim: `accept_claim_type = REFUND`, note fixed text plus owner's optional comment.

Multipart encoding: see `03-paypal-api-contract.md` section 2.3 (open question Q2).

In `DS_SUBMIT_MODE=dry-run`, the request is built by the same code, stored in `submissions.request_snapshot`, and the UI shows it as "This is exactly what would be sent" with a download button. Dry-run is the default in replay mode.

## 8. Prevent module rules

Input: `transactions` rows, `fulfilment_records`, current time, thresholds. Output: `risk_flags`. Pure function in `packages/core/src/risk/evaluate.ts`.

| Rule | Fires when | Severity | Suggested action |
| --- | --- | --- | --- |
| `R-PROT` | `txn.protection_eligibility` is `02` or `03` | MEDIUM (`02`), LOW (`03`) | `REVIEW` |
| `R-ADDR` | ship-to postal code or country on the transaction differs from the fulfilment record's | HIGH | `REVIEW` (hold shipment) |
| `R-NOTRACK` | no tracking on PayPal and no tracking in CSV, and more than `DS_NO_TRACKING_AFTER_HOURS` since payment | HIGH | `ADD_TRACKING` |
| `R-STUCK` | tracking exists, no delivery, and last scan older than `DS_STUCK_TRACKING_DAYS` | MEDIUM | `REVIEW` (contact carrier) or `REFUND` |
| `R-HIGH` | amount ≥ `DS_HIGH_VALUE_THRESHOLD` and any of the above | raises severity by one level | n/a |

The "protection" meaning of `01/02/03` is from PayPal's Transaction Search documentation ✅. The thresholds are **assumptions**, not PayPal rules, and the Setup page says so. Rules never claim "this order will be disputed"; they say "this order has a gap that commonly weakens a later case" and name the gap.

Actions:
- `ADD_TRACKING`: owner enters or confirms carrier and number (prefilled from CSV), previews the request, approves, submits (REST call in contract section 6). Dry-run stores the request only.
- `REFUND`: owner picks full or partial amount, previews, approves; sends `POST …/refund` ⚠️ with idempotency key. Always asks for a typed confirmation of the amount.
- `DISMISS`: requires a reason from a short list; audit logged.

## 9. Case Copilot (should-have)

- Tool-using chat with the AI SDK. Read tools only (`architecture.md` section 5.6).
- System prompt: answer only from tool results and the case's facts; cite fact keys as `[key]`; say "I can't see that" when a fact is absent.
- Answers pass through the same token check as the verifier (numbers, dates, IDs must appear in cited facts). A failed check replaces the answer with "I could not verify that answer; here are the facts I do have".
- The copilot cannot approve, submit or edit drafts. It can suggest a question for the owner to ask the buyer or the carrier.

## 10. Observability of the engine

Per draft attempt, log: case ID, prompt version, model, input fact count, output statement count, verifier accepted/rejected counts by reason, fallback used (bool), latency. The Setup/Health page shows rolling counts so a judge can see the verifier working ("Last 24 h: 14 statements drafted, 2 rejected: VALUE_MISMATCH").

## 11. Limits stated in the product

The README and the UI state plainly:
- Sandbox only. No production PayPal account is ever contacted.
- Supports item-not-received and refund-based evidence. Other reasons get a manual packet.
- Strength is a checklist, not a prediction.
- Fulfilment facts from a CSV are the seller's claims; PayPal and the carrier are the authorities.
- Thresholds in Prevent are adjustable assumptions.
