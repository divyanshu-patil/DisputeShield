# 0002. Go/no-go after the Day-0 spikes (P0-9)

Date: 2026-10-18. Gates from `docs/07-implementation-plan.md`; evidence in `0001-day0-spike-results.md`.

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 token and REST app | PASS | S0: token 200, `disputes/update-seller` and (after enabling Transaction search) `reporting/search/read` granted |
| G2 a sandbox dispute readable | PASS | S1/S2: 4 item-not-received disputes filed by a US buyer, list and details 200, parse against `@ds/schemas` |
| G3 provide-evidence | PASS, live | S3: form A 200 twice (USPS tracking; then with a PNG part `file1`), evidence visible on re-fetch |
| G4 webhook reaches and verifies | FAIL, fallback taken | S5: simulator events deliver but never verify (200 + `FAILURE`, as documented); the sandbox emitted no real `CUSTOMER.DISPUTE.*` event for 4 disputes. Polling every 5 minutes is the source of truth; the verified webhook route stays |
| G5 Transaction Search fields | PASS | S6: `shipping_info` and `protection_eligibility` on T0000 rows; `cart_info` empty for non-Orders payments |

**Decision: GO with Dispute Shield.** No switch to the fallback idea. G4 removes the "real-time" Should item: the UI and the Devpost text say updates arrive by polling, and webhooks are an optional speed-up. Still open and not blocking: S7/S8 (order paths, add-tracking, refund) wait for the $24 sandbox order to be approved; until then those paths run from fixtures and dry-run.

## Contract edits (`03-paypal-api-contract.md`), approved and applied 2026-10-18

These are spike results already in `0001` that the contract does not yet carry. Code that depends on them is marked below.

1. **2.3 Multipart part naming:** resolve the conflict. Form A is confirmed with document parts: JSON part `input` plus a file part `file1` → 200, and the evidence shows `documents[] {name, url}` (S3 cont., debug_id f14565841237d). Form B (`evidence-file`) not tried and not needed. Mark ✅. Used by `packages/paypal/src/live/multipart.ts`.
2. **2.3 carrier_name:** `OTHER` is rejected: 400 `INVALID_REQUEST` `CARRIER_NAME_IS_INVALID` (debug_id f9948717625cc). Replace "unknown, use OTHER" with "unknown names pass through upper-cased and the 400 is shown". `USPS` ✅. `normaliseCarrier()` already does this.
3. **2.4 / 2.2 resolution:** after accept-claim the dispute became `RESOLVED`, `dispute_state` `RESOLVED`, with `dispute_outcome` {`outcome_code` `RESOLVED_BUYER_FAVOUR`, `outcome_reason` `SELLER_ISSUED_REFUND`, `amount_refunded`}, links only `self` (S4 cont., fixture `paypal/disputes/PP-R-AUY-10193248.resolved.details.json`). Add `dispute_outcome` to 2.2 as ✅ (S4). **The sync already reads `dispute_outcome.outcome_code`** (`packages/pipeline/src/pipeline.ts`), so this edit brings the code back within rule 6.
4. **2.6:** `send-message` observed: `POST …/send-message {"message"}` → 200, body `{links:[detail]}` (S5 cont., debug_id f947680bed9c6). Still not used in the MVP.
5. **Section 9:** Q2 answered (form A with `file1`); Q3 partly answered (`USPS` yes, `OTHER` no; others open); Q5 answered (`REFUND` needs only `accept_claim_type`, `note` accepted); Q10 extended with `WAITING_FOR_BUYER_RESPONSE`, `UNDER_PAYPAL_REVIEW`, `RESOLVED` and the outcome codes above.
