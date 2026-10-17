# 03. PayPal API contract (what we may rely on)

This is the single source of truth for every PayPal parameter used in the code. **Coding agents must check this file before using a PayPal endpoint, field or parameter.** If something is not here, it is not allowed until a spike has confirmed it and this file has been updated.

Legend (same as `architecture.md`):
- ✅ read in PayPal documentation on 2026-10-17
- ⚠️ from memory or a third-party source; verify in the sandbox before depending on it
- ❓ unverified or conflicting; a spike must settle it (see `11-risks-and-day0-spikes.md`)

PayPal's documentation is at developer.paypal.com (Disputes API v1, Transaction Search API v1, Orders API v2, Webhooks). Base URL for this project is hard-coded to the sandbox: `https://api-m.sandbox.paypal.com` ⚠️ (host name from memory; confirm in S0). There is no production URL in the code.

## 1. Authentication

| Item | Contract | Status |
| --- | --- | --- |
| Token | `POST /v1/oauth2/token`, HTTP Basic with client ID and secret, body `grant_type=client_credentials` | ⚠️ |
| Lifetime | Sandbox tokens last roughly 3 to 8 hours; cache with an expiry margin, refresh on 401 | ✅ (toolkit docs) |
| Scopes used | Dispute read: part of the app's default dispute access. Dispute update (seller): `https://uri.paypal.com/services/disputes/update-seller`. Transaction search: `https://uri.paypal.com/services/reporting/search/read` | ✅ |
| App features | The REST app must have **Transaction search** enabled; dispute features must be enabled on the sandbox business account | ✅ / ❓ exact toggle names |

Failure modes to handle: `401` (refresh once, then `AuthError`), `403` (`PermissionError` with the missing scope or feature in the message when PayPal names it), `429` (`RateLimited`, honour `Retry-After` if present ⚠️).

## 2. Disputes API (`/v1/customer/disputes`)

### 2.1 List disputes

`GET /v1/customer/disputes` ✅

| Query parameter | Notes |
| --- | --- |
| `start_time` | filter by creation time ✅ |
| `disputed_transaction_id` | find the dispute for one transaction ✅ |
| `page`, `page_size`, `next_page_token` | pagination; prefer `next_page_token` when present ✅ |
| `dispute_state` | filter by state ✅ (accepted values ❓ confirm in S2) |
| `create_time_before`, `create_time_after`, `update_time_before`, `update_time_after` | ✅ |

Use `update_time_after` for incremental sync, with a 10 minute overlap, and de-duplicate by `dispute_id`.

### 2.2 Dispute details

`GET /v1/customer/disputes/{dispute_id}` ✅

Fields we read:

| Field | Use |
| --- | --- |
| `dispute_id` | primary key |
| `reason` | picks the evidence checklist |
| `status` | `OPEN`, `WAITING_FOR_SELLER_RESPONSE`, `WAITING_FOR_BUYER_RESPONSE`, `UNDER_REVIEW`, `RESOLVED` ✅ |
| `dispute_state` | coarse state ✅ (values ❓) |
| `dispute_life_cycle_stage` | `INQUIRY`, `CHARGEBACK`, `PRE_ARBITRATION`, `ARBITRATION` ✅ |
| `dispute_amount` {currency_code, value} | amount at risk ⚠️ shape |
| `disputed_transactions[]` | transaction ID, seller details, items ⚠️ shape; confirm in S2 |
| `seller_response_due_date` | deadline ✅ |
| `evidences` | what has already been submitted ✅ |
| `allowed_response_options` | which actions and offer types are currently valid ✅ |
| `links` | HATEOAS links; **the presence of a link is the authorisation to attempt that action** ✅ |
| `messages` | buyer and seller messages ⚠️ |

Design rule: never offer or attempt an action whose HATEOAS link is absent. `LinkMissing` is a first-class error.

### 2.3 Provide evidence

`POST /v1/customer/disputes/{id}/provide-evidence` ✅

| Aspect | Contract |
| --- | --- |
| Precondition | the dispute has a `provide-evidence` link ✅ |
| Scope | `https://uri.paypal.com/services/disputes/update-seller` ✅ |
| Content type | `multipart/form-data` ✅ |
| `evidence_type` values (what we use) | `PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, `OTHER` ✅ (the API accepts more types; we deliberately use only these three) |
| Tracking | `evidence_info.tracking_info[]` with `carrier_name` and `tracking_number` ✅ |
| Refunds | `evidence_info.refund_ids[]` ✅ |
| Notes | free text, at most 2000 characters ✅ |
| Files | JPG, JPEG, GIF, PNG, PDF; each under 10 MB; at most 50 MB per request ✅ |
| **Multipart part naming** | ❓ **Conflict.** The integration guide describes a JSON part named `input` plus document parts. The OpenAPI schema describes a single binary field `evidence-file`. S3 must try the guide form first, then the schema form, and the winning form is written into `packages/paypal/src/live/multipart.ts` with a comment citing this file. |

Required evidence by reason (from the integration guide ✅): for item-not-received disputes, `PROOF_OF_FULFILLMENT` with tracking number and carrier, or `PROOF_OF_REFUND`. Other reasons have their own required types; our MVP supports INR fully and `PROOF_OF_REFUND` flows for credit-not-processed and duplicate when a refund exists; everything else goes to the manual packet.

`carrier_name` must be a value PayPal accepts. The accepted list is ❓; S3 and S8 must record at least one working value (for example `OTHER` or a named carrier) and the code must expose a `normaliseCarrier()` map with an "unknown, use OTHER" fallback.

### 2.4 Accept claim

`POST /v1/customer/disputes/{id}/accept-claim` ✅

| Field | Notes |
| --- | --- |
| `note` | free text ⚠️ |
| `accept_claim_reason` | ❓ enumerations not captured; S4 records them |
| `accept_claim_type` | `REFUND`, `REFUND_WITH_RETURN`, `PARTIAL_REFUND`, `REFUND_WITH_RETURN_SHIPMENT_LABEL` ✅ |
| Content type | JSON in the examples; the schema also shows a multipart variant with an `accept-claim-document` field ❓ |

MVP uses `REFUND` only. Other types are listed in the UI as disabled with the reason "not in MVP".

### 2.5 Make offer

`POST /v1/customer/disputes/{id}/make-offer` ✅ (Could-have)

Body: `note`, `offer_amount {currency_code, value}`, `offer_type` (for example `REFUND_WITH_REPLACEMENT`). The valid `offer_type` values for a given dispute are in `allowed_response_options`; never send a value that is not listed there ✅.

### 2.6 Other actions (documented, not used in MVP)

`send-message`, `escalate`, `appeal`, `provide-supporting-info`, `acknowledge-return-item` ✅ exist. Not implemented. Listed here so agents do not invent paths.

### 2.7 Sandbox-only dispute tooling

These exist only for testing and live in `packages/paypal/src/sandbox-only/` and `apps/cli`. They are never imported by `apps/web`.

| Operation | Contract | Status |
| --- | --- | --- |
| Create dispute | `POST /v1/customer/disputes`, header `PayPal-Auth-Assertion` (JWT for the buyer), buyer scopes `DISPUTE_CREATE` / `UPDATE_BUYER` which **PayPal's account manager must add** to the app. Body: `disputed_transactions[].buyer_transaction_id`, `reason`, `dispute_amount`, `extensions`. Success `201`. | ✅ (access to scopes ❓ for an Indian developer account; S0/S1) |
| Require evidence | `POST …/require-evidence` with `{"action":"SELLER_EVIDENCE"}` or `{"action":"BUYER_EVIDENCE"}`. Precondition: dispute is `UNDER_REVIEW`. | ✅ |
| Adjudicate | `POST …/adjudicate` with `{"adjudication_outcome":"BUYER_FAVOR"}` or `"SELLER_FAVOR"` | ✅ |
| Process chargeback | `/v2/customer-support/process-chargeback` | ✅ (path only; not used) |

Fallback if the buyer scopes are not available (UI route ✅): in the sandbox, use a personal (buyer) account to pay the business account **by credit card**, wait a few minutes, then open the dispute from the buyer's PayPal sandbox UI. A second dispute on the same transaction is blocked, so create one purchase per scenario. Error simulation: `ERRDIS015` and `disputed_transaction_id=ERRDIS023` produce documented errors ✅. Accelerated Response is simulated by transaction amount ✅ (amounts ❓).

## 3. Webhooks

| Item | Contract | Status |
| --- | --- | --- |
| Events subscribed | `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED` | ✅ |
| Verify (postback) | `POST /v1/notifications/verify-webhook-signature`; body `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time`, `webhook_id`, `webhook_event`; headers on the incoming request: `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO`, `PAYPAL-TRANSMISSION-SIG`. Success is `verification_status: "SUCCESS"` | ✅ |
| Failed-verification HTTP code | PayPal's documentation contradicts itself | ❓ treat any non-`SUCCESS` status as failure and answer `400`; do not depend on PayPal's code |
| Retries | PayPal docs say retries for up to 3 days; a third-party source says about 25 attempts with exponential backoff | ❓ design for duplicates and long gaps either way |
| Ordering and duplicates | Events can arrive out of order and more than once ✅ | |
| Dedup | Atomically insert the event ID (unique constraint) before any work; a conflict means "already seen, answer 200" | design rule |
| Raw body | The body must be captured raw before parsing, because the signature is computed over exact bytes (offline mode) and we store it for audit | design rule |
| Offline verification | Works with the simulator's events; the postback method does not verify simulator events | ⚠️ third-party |

Webhook handler rule: verify, store, enqueue, answer fast. All fetching and drafting happens in jobs (`architecture.md` section 5.1). The webhook payload is a hint; we always re-fetch dispute details before acting.

## 4. Transaction Search (`GET /v1/reporting/transactions`)

| Item | Contract | Status |
| --- | --- | --- |
| Scope | `https://uri.paypal.com/services/reporting/search/read` | ✅ |
| Required | `start_date`, `end_date` (ISO 8601), window **at most 31 days** | ✅ |
| Latency | Data can lag by up to **3 hours** | ✅ |
| `page_size` | 1 to 500 | ✅ |
| `fields` | `transaction_info`, `payer_info`, `shipping_info`, `auction_info`, `cart_info`, `incentive_info`, `store_info`, `all` | ✅ |
| Filter by ID | `transaction_id` | ⚠️ |
| Protection | `transaction_info.protection_eligibility`: `01` eligible, `02` not eligible, `03` partially eligible | ✅ (code meanings ✅ per doc; verify in S6) |
| Order link | `transaction_info.paypal_reference_id` with `paypal_reference_id_type` = `ODR` points to the order | ✅ |
| Your own refs | `invoice_id`, `custom_field` | ✅ |
| App feature | "Transaction search" must be enabled on the app | ✅ |

Implementation: the client splits any requested range into windows of at most 30 days, follows pagination, and tags every transaction with the time it was fetched. Rules that depend on "now" use `fetched_at` and show "data may be up to 3 hours old".

## 5. Orders (`GET /v2/checkout/orders/{id}`)

Used to find the capture, the shipping address and any existing tracker. The top-level fields are known ✅; the nested paths for captures (`purchase_units[].payments.captures[]`), refunds and trackers are ❓ because the reference page was truncated when read. S7 must save a real response as a fixture and this section must be updated with the exact paths before `extract-order.ts` is written. Until then, `extract-order.ts` is allowed to exist only against fixtures from S7.

## 6. Tracking and refunds (write actions for Prevent)

| Operation | Contract | Status |
| --- | --- | --- |
| Add tracking | `POST /v2/checkout/orders/{id}/track` with `capture_id`, `tracking_number`, `carrier`, `notify_payer`, optionally `items` | ⚠️ memory; S8 confirms |
| Why it matters | PayPal's conceptual page says tracking numbers determine seller protection eligibility | ✅ |
| Toolkit alternative | `@paypal/agent-toolkit` has `create_shipment_tracking`, `get_shipment_tracking`, `update_shipment_tracking` | ✅ (tool names); parameters ❓ |
| Refund a capture | `POST /v2/payments/captures/{capture_id}/refund` with optional `amount`, `note_to_payer`, and a `PayPal-Request-Id` idempotency header | ⚠️ memory; S8 confirms |

Idempotency: every write we send carries a `PayPal-Request-Id` we generate and store with the submission, so a retry after a timeout cannot double-refund ⚠️ (header behaviour on these endpoints to be confirmed in S8).

## 7. `@paypal/agent-toolkit`

| Item | Contract | Status |
| --- | --- | --- |
| Import | `import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk'` | ✅ |
| Constructor | `clientId`, `clientSecret`, `configuration: { actions: {…}, context: { sandbox: true } }` | ✅ |
| Actions used (read only) | `disputes: { list: true, get: true }`, `shipment: { show: true }`, `orders: { get: true }`, plus transactions listing if present ❓ | ✅ for the first three |
| Tools | `toolkit.getTools()`, used with the AI SDK `generateText` | ✅ |
| AI SDK major version | The documented examples use `maxSteps`, which suggests an older AI SDK major | ❓ S9 pins the compatible version and records it in `packages/agent/package.json` |
| Env alternative | `PAYPAL_ACCESS_TOKEN`, `PAYPAL_ENVIRONMENT` | ✅ |
| Node | 18 or newer | ✅ |
| Gaps | The toolkit exposes about 43 functions in total ✅ (counted), but **no evidence upload, accept-claim or payout tools**; that is why disputes writes go through our own REST client | ✅ |

Rule: the toolkit is used only inside `packages/agent/src/copilot`, only with read actions, and every result is recorded through `record-tools.ts` so it appears as a citable fact.

## 8. Fixture strategy

- File naming: `<operation>.<scenario>.json`, for example `disputes/DS-001.inr-strong.details.json`.
- Recording: `pnpm ds record <operation> --scenario <id>` calls the live sandbox, passes the response through `redact.ts`, writes it into `packages/fixtures`. A human reads each new fixture before it is committed.
- Redaction: replace emails, names, phone numbers, street lines, tokens and webhook IDs with synthetic values that keep shape and length; keep amounts, currencies, dates (shifted consistently), IDs (replaced by fake IDs with the same prefix pattern), statuses and links structure.
- Every fixture must parse against its zod schema in `@ds/schemas/paypal/*` (`pnpm ds replay-check` enforces this in CI).
- Replay mode never makes a network call to PayPal. The CI job runs with `DS_MODE=replay` and no credentials.

## 9. Open contract questions

| ID | Question | Spike | Blocks |
| --- | --- | --- | --- |
| Q1 | Can an Indian developer account obtain the buyer scopes for sandbox dispute creation? | S0, S1 | scripted dispute seeding (fallback: UI route) |
| Q2 | Which multipart naming does `provide-evidence` accept? | S3 | live evidence submit |
| Q3 | Which `carrier_name` values are accepted? | S3, S8 | tracking and evidence |
| Q4 | Exact nested paths in order details for captures, refunds, trackers | S7 | `extract-order.ts` |
| Q5 | `accept-claim` required fields and reasons | S4 | accept flow |
| Q6 | Does the add-tracking endpoint behave as remembered, and does it accept `PayPal-Request-Id`? | S8 | Prevent module |
| Q7 | Which AI SDK version works with the toolkit? | S9 | Case Copilot |
| Q8 | AG Studio licence mechanism and variable name | S10 | dashboard |
| Q9 | Webhook failed-verification code and retry count | S5 | none (designed around) |
| Q10 | Are all `dispute_state` and `status` values captured? | S2 | state mapping |

Each answer is written back into the relevant section above, with the date and the fixture that proves it, and the ❓ is removed.
