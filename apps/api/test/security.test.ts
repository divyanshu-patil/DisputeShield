import { describe, expect, it } from "vitest";
import { PAYPAL_HEADERS_VALID, TEST_ENV, login, makeApp } from "./helpers.js";

// 09 section 8 items not covered in api.test.ts: CORS, log scrubbing, out-of-order webhooks.

describe("security", () => {
  it("gives no CORS allow header to another origin (AC-API-08)", async () => {
    const { app, env } = await makeApp();
    const preflight = (origin: string) =>
      app.inject({
        method: "OPTIONS",
        url: "/api/disputes",
        headers: { origin, "access-control-request-method": "GET" },
      });
    const evil = await preflight("https://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    const own = await preflight(env.WEB_ORIGIN);
    expect(own.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN);
    expect(own.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("keeps secrets, cookies and emails out of the logs (AC-NFR-04)", async () => {
    const lines: string[] = [];
    const { app } = await makeApp({ LOG_LEVEL: "trace" }, undefined, {
      write: (l) => void lines.push(l),
    });
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { code: "wrong-code-123" },
    });
    const cookie = await login(app);
    await app.inject({
      method: "GET",
      url: "/api/disputes",
      headers: { cookie },
    });
    await app.inject({
      method: "GET",
      url: "/api/nope",
      headers: { cookie, authorization: "Bearer A21AA-secret-token" },
    });
    await app.inject({
      method: "POST",
      url: "/api/cron/tick",
      headers: { "x-cron-secret": TEST_ENV.CRON_SECRET },
    });
    await app.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: PAYPAL_HEADERS_VALID,
      payload: `{"id":"WH-9","event_type":"CUSTOMER.DISPUTE.CREATED","resource":{"dispute_id":"PP-D-9","buyer":{"email":"real.buyer@gmail.com"}}}`,
    });
    const log = lines.join("");
    expect(lines.length).toBeGreaterThan(5);
    for (const secret of [
      TEST_ENV.DS_DEMO_ACCESS_CODE,
      "wrong-code-123",
      TEST_ENV.DS_COOKIE_SECRET,
      TEST_ENV.CRON_SECRET,
      cookie.split("=")[1] ?? "",
      "A21AA-secret-token",
      "real.buyer@gmail.com",
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it("treats out-of-order webhooks as a re-read of PayPal, never as state", async () => {
    const { app, events, jobs } = await makeApp();
    const send = (id: string, type: string, time: string) =>
      app.inject({
        method: "POST",
        url: "/api/webhooks/paypal",
        headers: { ...PAYPAL_HEADERS_VALID, "paypal-transmission-id": id },
        payload: `{"id":"${id}","event_type":"${type}","create_time":"${time}","resource":{"dispute_id":"PP-D-7"}}`,
      });
    // The resolution arrives before the creation it follows.
    expect(
      (
        await send(
          "WH-NEW",
          "CUSTOMER.DISPUTE.RESOLVED",
          "2026-10-17T12:00:00Z",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await send("WH-OLD", "CUSTOMER.DISPUTE.CREATED", "2026-10-17T10:00:00Z"))
        .statusCode,
    ).toBe(200);
    // Both events are kept; the job only names the dispute, so the sync reads PayPal's current state
    // whatever the order, and the shared dedupe key collapses the second while the first is queued.
    expect([...events.events.keys()].sort()).toEqual(["WH-NEW", "WH-OLD"]);
    expect(jobs.queued.map((j) => [j.payload, j.dedupeKey])).toEqual([
      [{ disputeId: "PP-D-7", eventId: "WH-NEW" }, "sync_dispute:PP-D-7"],
    ]);
  });
});
