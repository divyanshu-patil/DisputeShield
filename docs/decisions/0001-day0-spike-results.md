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
