import { describe, expect, it, vi } from "vitest";
import {
  AuthError,
  PermissionError,
  RateLimited,
  SANDBOX_BASE_URL,
  redact,
  requestToken,
} from "../src/index.js";

const creds = { clientId: "client-id-1", clientSecret: "very-secret-value" };
const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("requestToken", () => {
  it("posts_client_credentials_to_the_sandbox_and_parses_scopes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json(200, {
        access_token: "A21AAtoken",
        token_type: "Bearer",
        expires_in: 32400,
        scope: "s/one s/two",
        nonce: "n",
      }),
    );
    const token = await requestToken(creds, fetchMock);
    expect(token).toMatchObject({
      accessToken: "A21AAtoken",
      tokenType: "Bearer",
      expiresInSeconds: 32400,
      scopes: ["s/one", "s/two"],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SANDBOX_BASE_URL}/v1/oauth2/token`);
    expect(init?.body).toBe("grant_type=client_credentials");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("client-id-1:very-secret-value").toString("base64")}`,
    );
  });

  it.each([
    [401, AuthError],
    [403, PermissionError],
    [429, RateLimited],
  ])("maps_http_%i_to_a_typed_error_with_debug_id", async (status, type) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json(
        status,
        {
          error: "invalid_client",
          error_description: "Client Authentication failed",
        },
        { "paypal-debug-id": "dbg-1" },
      ),
    );
    const err: unknown = await requestToken(creds, fetchMock).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(type);
    expect(err).toMatchObject({ status, debugId: "dbg-1" });
    expect((err as Error).message).toContain("Client Authentication failed");
    expect((err as Error).message).not.toContain(creds.clientSecret);
  });
});

describe("redact", () => {
  it("masks_tokens_keeping_length_and_replaces_emails", () => {
    const out = redact({
      access_token: "A21AAsecret",
      nested: [{ email: "jane@shop.test", note: "hi" }],
      expires_in: 3,
    });
    expect(out).toEqual({
      access_token: "A21xxxxxxxx",
      nested: [{ email: "buyer@example.com", note: "hi" }],
      expires_in: 3,
    });
  });
  it("replaces_dispute_parties_and_masks_account_ids", () => {
    const out = redact({
      buyer: { name: "Real Name", email: "r@x.com", payer_id: "3ZCPBP8VKH5FQ" },
      seller: { name: "Shop", email: "s@x.com", merchant_id: "BTFAD4QTSSHM6" },
      buyer_transaction_id: "6N175353601156814",
    });
    expect(out).toEqual({
      buyer: {
        name: "Jordan Avery",
        email: "buyer@example.com",
        payer_id: "3ZCxxxxxxxxxx",
      },
      seller: {
        name: "Hearthside Ceramics",
        email: "seller@example.com",
        merchant_id: "BTFxxxxxxxxxx",
      },
      buyer_transaction_id: "6N175353601156814",
    });
  });
});
