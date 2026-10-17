# 0001. Day-0 spike results

Template from `docs/11-risks-and-day0-spikes.md` section 2. One block per attempt; redacted ids only.

```text
Spike: S0  Date: 2026-10-17  Result: FAIL (attempt 1, setup error)
What I ran: pnpm ds spike s0  (POST https://api-m.sandbox.paypal.com/v1/oauth2/token, client credentials)
What happened: HTTP 401 invalid_client "Client Authentication failed", debug_id ca4bf22ba38ee.
  Cause: PAYPAL_CLIENT_SECRET in .env held the same value as PAYPAL_CLIENT_ID (checked by comparison, values not printed).
  The sandbox host answered, so the base URL resolves; the token call itself is not confirmed until a 200.
Contract changes: none yet (section 1 stays ⚠️ until a successful token response).
Plan changes: none. Re-run after the secret is corrected.
```

```text
Spike: S0  Date: 2026-10-17  Result: PARTIAL (token PASS; Transaction search scope missing)
What I ran: pnpm ds spike s0
What happened: HTTP 200. token_type Bearer, expires_in 32400 (9 h), 29 scopes, fields access_token, token_type,
  app_id, expires_in, nonce, scope (space-separated). Fixture: packages/fixtures/paypal/oauth/token.json (redacted).
  Present: disputes/update-seller, disputes/read-seller, disputes/read-buyer, disputes/create, payments/refund,
  applications/webhooks. Missing: reporting/search/read (Transaction search).
Contract changes: base URL and section 1 token row to ✅, observed lifetime, granted scopes, 401 body shape (approved and applied 2026-10-17).
Plan changes: enable Transaction search on the REST app before S6 (G5). disputes/create is present, so S1 route A
  (API dispute creation) may work without the account manager ❓; try it in S1.
Features recorded: Transaction search not enabled yet; other toggle names not recorded (need the dashboard).
```

```text
Spike: S1  Date: 2026-10-17  Result: IN PROGRESS (tooling ready, no dispute yet)
What I ran: pnpm ds spike s1  (seller GET /v1/customer/disputes)
What happened: HTTP 200, debug_id f11650201819d, body has an "items" array with 0 disputes.
Route chosen: B (UI). Route A needs a buyer transaction id from a real payment either way, and the contract does not
  specify the `extensions` body, so it would mean inventing fields (AGENTS.md rule 6). Route A stays open for later
  scenarios; S0 showed the app holds `disputes/create` (Q1 still open).
Contract changes: none.
Plan changes: none.
```

```text
Spike: S1  Date: 2026-10-17  Result: PASS (Route B, UI)
What I ran: sandbox UI as the buyer, then pnpm ds spike s1
What happened:
  - The first personal sandbox account (India: bank YES BANK) could not Send: "Your account is not supported for this
    action". A new US personal sandbox account worked.
  - 3 goods-and-services payments from the US buyer to the business account, paid by Visa (card, not balance):
    $48.00 (DS-1001), $129.00 (DS-1002), $36.00 (DS-1003).
  - 3 disputes via Activity -> payment -> "Report a problem" -> "I haven't received the item or service":
    PP-R-QBT-10193246 ($48, issue type "haven't received tracking info"),
    PP-R-VDG-10193247 ($129, same), PP-R-AUY-10193248 ($36, "item hasn't reached me").
  - Seller GET /v1/customer/disputes (debug_id f6362072cc92d): 2 of 3 visible within ~8 minutes.
    Observed: status WAITING_FOR_SELLER_RESPONSE and UNDER_REVIEW; reason MERCHANDISE_OR_SERVICE_NOT_RECEIVED;
    dispute_id has the form PP-R-XXX-NNNNNNNN.
Contract changes: proposed (Route B steps, US buyer note, observed status/reason values); not applied until approved.
Plan changes: buyer account must be US (or another country that allows personal Send). Route A (API) not tried.
```

```text
Spike: S2  Date: 2026-10-17  Result: PASS
What I ran: pnpm ds spike s2  (list with update_time_after, then details for each dispute)
What happened: list 200, 3 disputes; all 3 details 200 and parse against @ds/schemas PaypalDisputeDetails.
  Observed (all 3, INR, a few minutes after filing):
  - status WAITING_FOR_SELLER_RESPONSE (S1 briefly saw UNDER_REVIEW on one); dispute_state REQUIRED_ACTION;
    dispute_life_cycle_stage INQUIRY; dispute_channel INTERNAL; reason MERCHANDISE_OR_SERVICE_NOT_RECEIVED
    (also per item in disputed_transactions[].items[].reason).
  - dispute_amount and gross_amount are {currency_code, value: string}.
  - disputed_transactions[]: buyer_transaction_id, seller_transaction_id, create_time, transaction_status (HELD),
    gross_amount, buyer {email, payer_id, name}, seller {email, merchant_id, name}, items[] {item_name,
    item_description, item_quantity (string), reason, item_type PRODUCT}, seller_protection_eligible,
    seller_protection_type EXPANDED_SELLER_PROTECTION.
  - links (details): self GET, accept_claim, provide_evidence, send_message, escalate, make_offer (POST).
    List items carry only self.
  - allowed_response_options: accept_claim.accept_claim_types [PARTIAL_REFUND, REFUND], make_offer.offer_types [REFUND].
  - seller_response_due_date present (filing + 20 days). messages[] {posted_by BUYER, time_posted, content}.
  - evidences[]: CREATE (SUBMITTED_BY_BUYER, notes) and PROOF_OF_FULFILLMENT (REQUESTED_FROM_SELLER).
  - Also present, not in the contract: fund_movements[] (HOLD_PLACED DEBIT), offer.buyer_requested_amount,
    refund_details.allowed_refund_amount, extensions {merchant_contacted, buyer_contacted_time}.
  Fixtures: packages/fixtures/paypal/disputes/{list.sandbox, PP-R-*.details}.json, redacted (parties synthetic,
  payer_id/merchant_id masked); 0 of 7 real party values found in them.
Contract changes: 2.1 response shape, 2.2 field shapes and observed links/options, Q10 narrowed (approved and applied 2026-10-17).
Plan changes: none.
```

```text
Spike: S3  Date: 2026-10-17  Result: PASS (form A, no file)
What I ran: pnpm ds spike s3 --send  (PP-R-QBT-10193246, $48 INR, WAITING_FOR_SELLER_RESPONSE, require-evidence not needed)
Request: POST {links[rel=provide_evidence].href}, multipart/form-data with one part `input` (application/json):
  {"evidences":[{"evidence_type":"PROOF_OF_FULFILLMENT","evidence_info":{"tracking_info":[{"carrier_name":"USPS",
  "tracking_number":"…"}]},"notes":"…"}]}
What happened: HTTP 200, debug_id ca4bf9548ee19, body {links:[{rel:"detail",method:"GET"}]}.
  Re-fetch: evidence present with source SUBMITTED_BY_SELLER, evidence_info.tracking_info as sent,
  action_info.action PROVIDE_EVIDENCE. status UNDER_REVIEW, dispute_state UNDER_PAYPAL_REVIEW, links only self.
  A few minutes later the list showed status WAITING_FOR_BUYER_RESPONSE.
Not tried: form B, file parts, carrier OTHER (the dispute left the state that allows evidence after one call).
Contract changes: proposed (2.3, Q2 answered for form A, Q3 USPS accepted); not applied until approved.
Plan changes: multipart.ts uses form A. File parts still unverified; try them on the next INR dispute.

Spike: S4  Date: 2026-10-17  Result: PARTIAL (2xx and refund issued; not RESOLVED yet)
What I ran: pnpm ds spike s4 --send  (PP-R-AUY-10193248, $36 INR)
Request: POST {links[rel=accept_claim].href}, JSON {"note":"…","accept_claim_type":"REFUND"}; no accept_claim_reason.
What happened: HTTP 200, debug_id ca4bf95900a12, body {links:[{rel:"detail",method:"GET"}]}.
  Re-fetch: evidence OTHER from SUBMITTED_BY_SELLER with action_info {action ACCEPT_CLAIM, response_option REFUND};
  refund_details.transactions[] {id, gross_amount 36.00, create_time}; fund_movements DISPUTE_SETTLEMENT debit and
  credit 36.00; new key money_movements; status UNDER_REVIEW, dispute_state UNDER_PAYPAL_REVIEW, links only self.
  Still UNDER_REVIEW minutes later; re-check for RESOLVED and dispute_outcome.
Contract changes: proposed (2.4, Q5: accept_claim_reason not required for REFUND); not applied until approved.
Plan changes: treat accept-claim as "refund issued, resolution pending"; the sync job must pick up RESOLVED later.
```

```text
Spike: S5  Date: 2026-10-18  Result: IN PROGRESS (delivery works; simulator event does not verify, as documented)
What I ran: ngrok http 4000 -> pnpm dev (API :4000); dashboard webhook on /api/webhooks/paypal for the three
  CUSTOMER.DISPUTE.* events; dashboard Webhooks simulator; pnpm ds spike s5.
What happened:
  - The first listener URL was /api/webhook (wrong path); fixed to /api/webhooks/paypal.
  - Simulator "Send test" (Disputes updated, corrected URL) was delivered ~3 s after "queued" per the page timestamps
    (00:22:27 queued, 00:22:30 received). Sample dispute PP-000-042-663-135, 2018 dates. The earlier CREATED test
    went to the wrong path and never arrived.
  - Headers: Paypal-Transmission-Id, -Transmission-Time, -Cert-Url (on api.paypal.com even in sandbox),
    -Auth-Algo SHA256withRSA, -Transmission-Sig, plus Paypal-Auth-Version v2 (not in the contract).
    Content-Length equals the raw body length; no content-encoding.
  - Event body: id (WH-…), event_type, event_version 1.0, create_time, resource_type "dispute", summary,
    resource (a dispute with dispute_id, status, links …), links (self, resend) on api.paypal.com.
  - verify-webhook-signature: HTTP 200 {"verification_status":"FAILURE"} for the simulator event as received
    (debug_id f234482b59432) and with a broken signature (debug_id f23448248f608). Q9: the postback answers
    200 + FAILURE for a bad signature, not an error code.
  - Our route answered 400 WEBHOOK_UNVERIFIED (replay verifier), as designed.
  Fixtures: paypal/webhooks/simulator.customer-dispute-updated.{body,headers}.json (redacted).
Still needed for PASS: a real (non-simulator) event that verifies with SUCCESS.
```

```text
Spike: S3 (continued)  Date: 2026-10-18  Result: PASS (file part)
What I ran: pnpm ds spike s3 --dispute PP-R-VDG-10193247 [--carrier OTHER] --file --send
What happened:
  - carrier_name OTHER: HTTP 400 INVALID_REQUEST [CARRIER_NAME_IS_INVALID] (debug_id f9948717625cc). Q3: OTHER is
    rejected as a plain carrier name.
  - USPS + a 1x1 PNG as multipart part `file1`: HTTP 200 (debug_id f14565841237d). Re-fetch: the seller evidence has
    documents[] {name "proof-of-shipment.png", url …/v2/content/documents/…/download}. Form A with file parts works.
  - Both INR disputes later showed WAITING_FOR_BUYER_RESPONSE with links self, accept_claim, send_message, escalate.

Spike: S4 (continued)  Date: 2026-10-18  Result: PASS
  PP-R-AUY-10193248 became RESOLVED (dispute_state RESOLVED) with dispute_outcome {outcome_code RESOLVED_BUYER_FAVOUR,
  outcome_reason SELLER_ISSUED_REFUND, amount_refunded 36.00 USD}; links only self.
  Fixture: paypal/disputes/PP-R-AUY-10193248.resolved.details.json.

Spike: S5 (continued)  Date: 2026-10-18  Result: no real event yet
  - Dashboard check: webhook URL, ID (matches .env) and the three dispute events correct; Transaction search on
    (token now has reporting/search/read); "Customer disputes" feature was OFF and was switched ON.
  - send-message: POST …/send-message {"message": "…"} → HTTP 200 (debug_id f947680bed9c6), body {links:[detail]}.
  - Developer Dashboard → Event Logs → Webhook Events: "No data" for the last 30 days, also after the message.
    PayPal has not emitted any real CUSTOMER.DISPUTE.* event for this app; simulator events do arrive.
  - A second simulator test (00:48:41 IST) was not delivered within 10 minutes (ngrok and API had been restarted).
```

```text
Spike: S5 (closed)  Date: 2026-10-18  Result: PARTIAL, fallback taken (polling)
What I ran: new $36 payment (buyer pressed Send) → item-not-received dispute PP-R-GSH-10193291 filed in the
  buyer UI after "Customer disputes" was switched on; ngrok watched 10 minutes; dashboard Webhook Events checked.
What happened: the dispute reached WAITING_FOR_SELLER_RESPONSE with links self, accept_claim, make_offer, escalate,
  send_message, provide_evidence. No CUSTOMER.DISPUTE.* delivery reached ngrok and the Webhook Events log shows
  "No data". Endpoint reachable (public /api/health 200).
Decision: per 11-risks S5 fallback, the 5-minute polling sync is the source of truth and the UI does not claim
  real-time. /api/webhooks/paypal stays (verify → store → enqueue) for when sandbox delivery works. G4 optional.
Open: whether sandbox emits dispute events at all for UI-filed disputes (Q12 stays open; re-test on Render).
```

```text
Spike: S6  Date: 2026-10-18  Result: PASS (shipping, protection) / PARTIAL (cart)
What I ran: pnpm ds spike s6  (GET /v1/reporting/transactions, last 30 days,
  fields=transaction_info,payer_info,shipping_info,cart_info, page_size=100)
What happened: HTTP 200, 9 transactions, 1 page, last_refreshed_datetime 2026-10-17T17:59:59Z (a payment made
  ~2 h later was not yet listed: the documented lag is real).
  - Seller payments are event code T0000 with protection_eligibility "01" and shipping_info
    {name, address{line1, city, state, country_code, postal_code}}.
  - Dispute side effects appear as their own rows: T1110 hold (status P, negative amount, protection "02"),
    T1111 hold release (D), T1107 refund (S). T1900 is the sandbox funding row.
  - paypal_reference_id_type is TXN (the buyer-side id) for these UI payments, not ODR: there is no order link
    unless the payment went through the Orders API (S7 created one). cart_info is empty ({}) for them.
Contract changes: section 4 (event codes, TXN vs ODR, cart only for Orders/cart payments, lag observed).
Plan changes: txn.item_names may be absent; R-ADDR keeps working (shipping_info present). Schema:
  @ds/schemas PaypalTransactionSearch; fixture paypal/transactions/search.sandbox.json.

Spike: S9  Date: 2026-10-18  Result: PASS
What I ran: pnpm ds spike s9 [--models …] (drafter stand-in prompt on DS-001 facts x5, tool round trip,
  two parallel requests); pnpm ds spike s9 --toolkit (PayPal toolkit read tools driven by Ollama).
What happened: GET /api/tags lists 21 models. Free plan: gemma4:31b works; glm-5.3-flash → HTTP 402
  "not included in your free usage".
  | model         | JSON parse | zod-valid | cites hold | median latency | tool call |
  | gemma4:31b    | 5/5        | 5/5       | 5/5        | 2.3 s          | yes, grounded |
  | gpt-oss:120b  | 5/5        | 5/5       | 4/5        | 3.5 s          | yes, grounded |
  | gpt-oss:20b   | 5/5        | 5/5       | 4/5        | 9.5 s          | yes, grounded |
  `tool` message with `tool_name` works. Two parallel requests: both 200, no 429 observed.
  "gemma4:31b:cloud" is also accepted, but /api/tags lists "gemma4:31b"; use the listed name.
  Toolkit 1.11.0: the `@paypal/agent-toolkit/openai` adapter gives JSON-schema tools that Ollama accepts
  as-is and `handleToolCall` runs them; no AI SDK needed. Read actions: disputes.list/get, orders.get,
  shipment.get (not "show"), transactions.list. gemma4:31b called get_dispute on PP-R-GSH-10193291 and
  answered with the right status and amount (1 tool round, 5.1 s).
Decision: LLM_MODEL=gemma4:31b. Adapter: packages/agent/src/copilot/toolkit.ts (createPaypalReadTools).
Contract changes: section 7, Q7 and Q11 answered.
```
