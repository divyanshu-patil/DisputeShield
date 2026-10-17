import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "../src/index.js";

describe("api client", () => {
  it("maps_error_bodies_and_reports_401", async () => {
    let unauthorized = 0;
    const api = createApiClient({
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Authentication required",
              requestId: "r",
            },
          }),
          { status: 401 },
        ),
      onUnauthorized: () => void unauthorized++,
    });
    await expect(api.disputes()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    await expect(api.disputes()).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toBe(2);
  });
  it("sends_json_with_credentials", async () => {
    let init: RequestInit | undefined;
    const api = createApiClient({
      fetch: async (_u, i) => (
        (init = i),
        new Response(JSON.stringify({ ok: true }))
      ),
    });
    await api.approveEvidence("DS-001", "d1");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(init?.body as string)).toEqual({
      action: "PROVIDE_EVIDENCE",
      draftId: "d1",
      confirm: true,
    });
  });
});
