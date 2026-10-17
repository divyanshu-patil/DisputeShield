import { describe, expect, it, vi } from "vitest";
import { PermissionError, SANDBOX_BASE_URL, paypalGet } from "../src/index.js";

describe("paypalGet", () => {
  it("sends_the_bearer_token_to_the_sandbox_host", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "paypal-debug-id": "dbg-2" },
      }),
    );
    await expect(
      paypalGet("/v1/customer/disputes", "tok", fetchMock),
    ).resolves.toEqual({
      status: 200,
      body: { items: [] },
      debugId: "dbg-2",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SANDBOX_BASE_URL}/v1/customer/disputes`);
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
  });

  it("maps_403_to_permission_error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "NOT_AUTHORIZED",
          message: "Authorization failed",
          debug_id: "dbg-3",
        }),
        { status: 403 },
      ),
    );
    await expect(
      paypalGet("/v1/customer/disputes", "tok", fetchMock),
    ).rejects.toMatchObject({
      constructor: PermissionError,
      debugId: "dbg-3",
    });
  });
});
