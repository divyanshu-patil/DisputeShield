import { describe, expect, it, vi } from "vitest";
import {
  PermissionError,
  SANDBOX_BASE_URL,
  evidenceFormA,
  paypalGet,
  paypalRequest,
} from "../src/index.js";

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

describe("paypalRequest", () => {
  it("sends_json_and_multipart_bodies", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response("{}", { status: 200 })),
      );
    await paypalRequest("POST", "/a", "tok", { note: "x" }, fetchMock);
    const form = evidenceFormA({
      evidences: [{ evidence_type: "OTHER", notes: "n" }],
    });
    await paypalRequest("POST", "/b", "tok", form, fetchMock);
    const [json, multi] = fetchMock.mock.calls.map((c) => c[1]!);
    expect((json!.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect(json!.body).toBe('{"note":"x"}');
    expect(
      (multi!.headers as Record<string, string>)["content-type"],
    ).toBeUndefined();
    const input = (multi!.body as FormData).get("input") as Blob;
    expect(input.type).toBe("application/json");
    expect(JSON.parse(await input.text())).toEqual({
      evidences: [{ evidence_type: "OTHER", notes: "n" }],
    });
  });

  it("puts_validation_issue_codes_in_the_error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "UNPROCESSABLE_ENTITY",
          message: "The requested action could not be performed",
          details: [
            {
              issue: "INVALID_EVIDENCE_TYPE",
              field: "evidence_type",
              description: "echo of input",
            },
          ],
        }),
        { status: 422 },
      ),
    );
    await expect(
      paypalRequest("POST", "/c", "tok", {}, fetchMock),
    ).rejects.toThrow(
      "PayPal HTTP 422: UNPROCESSABLE_ENTITY: The requested action could not be performed [INVALID_EVIDENCE_TYPE@evidence_type]",
    );
  });
});
