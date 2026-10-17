import {
  PaypalDisputeDetails,
  PaypalDisputeList,
  PaypalOrder,
  PaypalTransactionSearch,
} from "@ds/schemas";
import type { z } from "zod";
import {
  AuthError,
  PayPalError,
  RateLimited,
  UpstreamError,
} from "../errors.js";
import type { PayPalGateway, Raw, TxnQuery } from "../gateway.js";
import { requestToken } from "./auth.js";
import { type RawResponse, paypalRequest } from "./client.js";
import { evidenceFormA } from "./multipart.js";

// Sandbox adapter (architecture.md section 7): token cache, one refresh on 401 (AC-SYNC-08), retries with
// backoff on 429 and 5xx, responses parsed against @ds/schemas.

export type LiveGatewayOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
};

const WEBHOOK_HEADERS = {
  transmission_id: "paypal-transmission-id",
  transmission_time: "paypal-transmission-time",
  cert_url: "paypal-cert-url",
  auth_algo: "paypal-auth-algo",
  transmission_sig: "paypal-transmission-sig",
} as const;

export class LiveGateway implements PayPalGateway {
  readonly mode = "live" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: LiveGatewayOptions) {
    this.doFetch = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > this.now() + 60_000)
      return this.token.value;
    const t = await requestToken(
      { clientId: this.o.clientId, clientSecret: this.o.clientSecret },
      this.doFetch,
    );
    this.token = {
      value: t.accessToken,
      expiresAt: this.now() + t.expiresInSeconds * 1000,
    };
    return t.accessToken;
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<RawResponse> {
    const max = this.o.maxRetries ?? 2;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      try {
        // FormData bodies are rebuilt per attempt by the caller-provided factory.
        const b = typeof body === "function" ? (body as () => unknown)() : body;
        return await paypalRequest(
          method,
          path,
          await this.accessToken(),
          b,
          this.doFetch,
          headers,
        );
      } catch (err) {
        if (err instanceof AuthError && !refreshed) {
          refreshed = true;
          await this.accessToken(true);
          continue;
        }
        const retryable =
          err instanceof RateLimited ||
          (err instanceof UpstreamError && err.status >= 500);
        if (!retryable || attempt >= max) throw err;
        const wait =
          err instanceof RateLimited && err.retryAfterSeconds
            ? err.retryAfterSeconds * 1000
            : 500 * 2 ** attempt;
        // A long Retry-After goes back to the job queue instead of blocking this worker.
        if (wait > 10_000) throw err;
        await this.sleep(wait);
      }
    }
  }

  private async get<S extends z.ZodType>(
    path: string,
    schema: S,
  ): Promise<Raw<z.output<S>>> {
    return this.wrap(await this.call("GET", path), schema);
  }

  private wrap<S extends z.ZodType>(
    res: RawResponse,
    schema: S,
  ): Raw<z.output<S>> {
    const parsed = schema.safeParse(res.body);
    if (!parsed.success) {
      throw new UpstreamError(
        `PayPal response has an unexpected shape: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => i.path.join("."))
          .join(", ")}`,
        res.status,
        res.debugId,
      );
    }
    return {
      status: res.status,
      body: parsed.data,
      recordedAt: new Date(this.now()).toISOString(),
      ...(res.debugId ? { debugId: res.debugId } : {}),
    };
  }

  private raw(res: RawResponse): Raw<unknown> {
    return {
      status: res.status,
      body: res.body,
      recordedAt: new Date(this.now()).toISOString(),
      ...(res.debugId ? { debugId: res.debugId } : {}),
    };
  }

  listDisputes(q: Parameters<PayPalGateway["listDisputes"]>[0]) {
    const p = new URLSearchParams({ page_size: String(q.pageSize ?? 50) });
    if (q.updateTimeAfter) p.set("update_time_after", q.updateTimeAfter);
    if (q.nextPageToken) p.set("next_page_token", q.nextPageToken);
    return this.get(`/v1/customer/disputes?${p.toString()}`, PaypalDisputeList);
  }

  getDispute(id: string) {
    return this.get(
      `/v1/customer/disputes/${encodeURIComponent(id)}`,
      PaypalDisputeDetails,
    );
  }

  async provideEvidence(
    id: string,
    input: Parameters<PayPalGateway["provideEvidence"]>[1],
    files: Parameters<PayPalGateway["provideEvidence"]>[2] = [],
  ) {
    // Form A (S3 ✅): JSON part `input` plus `file1…` parts.
    return this.raw(
      await this.call(
        "POST",
        `/v1/customer/disputes/${encodeURIComponent(id)}/provide-evidence`,
        () => evidenceFormA(input, files),
      ),
    );
  }

  async acceptClaim(
    id: string,
    input: Parameters<PayPalGateway["acceptClaim"]>[1],
  ) {
    return this.raw(
      await this.call(
        "POST",
        `/v1/customer/disputes/${encodeURIComponent(id)}/accept-claim`,
        input,
      ),
    );
  }

  /** Splits the range into windows of at most 30 days (contract 4) and follows pagination. */
  async searchTransactions(q: TxnQuery) {
    const details: z.output<
      typeof PaypalTransactionSearch
    >["transaction_details"] = [];
    let last: Raw<z.output<typeof PaypalTransactionSearch>> | null = null;
    const end = Date.parse(q.endDate);
    for (
      let from = Date.parse(q.startDate);
      from < end;
      from += 30 * 86_400_000
    ) {
      const to = Math.min(from + 30 * 86_400_000, end);
      for (let page = 1; page <= 20; page++) {
        const p = new URLSearchParams({
          start_date: new Date(from).toISOString().replace(/\.\d{3}Z$/, "Z"),
          end_date: new Date(to).toISOString().replace(/\.\d{3}Z$/, "Z"),
          fields: "transaction_info,shipping_info,cart_info",
          page_size: "500",
          page: String(page),
        });
        if (q.transactionId) p.set("transaction_id", q.transactionId);
        last = await this.get(
          `/v1/reporting/transactions?${p.toString()}`,
          PaypalTransactionSearch,
        );
        details.push(...last.body.transaction_details);
        if (!last.body.total_pages || page >= last.body.total_pages) break;
      }
    }
    if (!last) throw new UpstreamError("empty transaction search range", 400);
    return { ...last, body: { ...last.body, transaction_details: details } };
  }

  getOrder(id: string) {
    return this.get(
      `/v2/checkout/orders/${encodeURIComponent(id)}`,
      PaypalOrder,
    );
  }

  async addTracking(
    orderId: string,
    input: Parameters<PayPalGateway["addTracking"]>[1],
    opts: { requestId: string },
  ) {
    return this.raw(
      await this.call(
        "POST",
        `/v2/checkout/orders/${encodeURIComponent(orderId)}/track`,
        input,
        { "paypal-request-id": opts.requestId },
      ),
    );
  }

  async refundCapture(
    captureId: string,
    input: Parameters<PayPalGateway["refundCapture"]>[1],
    opts: { requestId: string },
  ) {
    return this.raw(
      await this.call(
        "POST",
        `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
        input,
        { "paypal-request-id": opts.requestId },
      ),
    );
  }

  /** Postback verification (contract 3). Anything but SUCCESS fails; errors fail closed. */
  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
    webhookId: string,
  ) {
    const h = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const missing = Object.values(WEBHOOK_HEADERS).filter((k) => !h[k]);
    if (missing.length > 0)
      return { ok: false, detail: `MISSING_HEADERS ${missing.join(",")}` };
    const fields = Object.entries(WEBHOOK_HEADERS).map(
      ([field, header]) => `"${field}":${JSON.stringify(h[header])}`,
    );
    // The event goes in byte for byte: re-serialising it would change the signed body.
    const body = `{${fields.join(",")},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${rawBody}}`;
    try {
      const res = await this.call(
        "POST",
        "/v1/notifications/verify-webhook-signature",
        body,
      );
      const status = (res.body as { verification_status?: unknown } | undefined)
        ?.verification_status;
      return status === "SUCCESS"
        ? { ok: true, detail: "SUCCESS" }
        : { ok: false, detail: typeof status === "string" ? status : "NO_STATUS" };
    } catch (err) {
      return {
        ok: false,
        detail:
          err instanceof PayPalError
            ? `VERIFY_ERROR ${err.status}`
            : "VERIFY_ERROR",
      };
    }
  }
}
