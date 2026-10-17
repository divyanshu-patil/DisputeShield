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
