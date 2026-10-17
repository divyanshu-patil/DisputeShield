import type {
  PaypalDisputeDetails,
  PaypalOrder,
  PaypalTransactionDetail,
} from "@ds/schemas";
import { PayPalError } from "../errors.js";
import type { PayPalGateway, Raw } from "../gateway.js";

// Serves scenario data (built by @ds/fixtures) with no network call (contract 8). Writes return the
// response shape recorded in S3/S4/S8 and change nothing.

export type ReplayData = {
  disputes: PaypalDisputeDetails[];
  transactions: PaypalTransactionDetail[];
  orders: PaypalOrder[];
};

export class NotFound extends PayPalError {
  constructor(what: string) {
    super(`PayPal HTTP 404: RESOURCE_NOT_FOUND (${what}, replay)`, 404);
  }
}

export class ReplayGateway implements PayPalGateway {
  readonly mode = "replay" as const;
  readonly writes: { op: string; id: string; body: unknown }[] = [];

  constructor(
    private readonly data: () => ReplayData,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private raw<T>(body: T, status = 200): Raw<T> {
    return {
      status,
      body,
      recordedAt: this.now().toISOString(),
      debugId: "replay",
    };
  }

  async listDisputes(q: { updateTimeAfter?: string }) {
    const items = this.data()
      .disputes.filter(
        (d) => !q.updateTimeAfter || d.update_time > q.updateTimeAfter,
      )
      .map((d) => ({ ...d, links: d.links.filter((l) => l.rel === "self") }));
    return this.raw({ items, links: [] });
  }

  async getDispute(id: string) {
    const d = this.data().disputes.find((x) => x.dispute_id === id);
    if (!d) throw new NotFound(`dispute ${id}`);
    return this.raw(d);
  }

  async provideEvidence(id: string, input: unknown) {
    await this.getDispute(id);
    this.writes.push({ op: "provideEvidence", id, body: input });
    return this.raw({
      links: [
        { href: `/v1/customer/disputes/${id}`, rel: "detail", method: "GET" },
      ],
    });
  }

  async acceptClaim(id: string, input: unknown) {
    await this.getDispute(id);
    this.writes.push({ op: "acceptClaim", id, body: input });
    return this.raw({
      links: [
        { href: `/v1/customer/disputes/${id}`, rel: "detail", method: "GET" },
      ],
    });
  }

  async searchTransactions(q: {
    startDate: string;
    endDate: string;
    transactionId?: string;
  }) {
    const rows = this.data().transactions.filter((t) => {
      const at = t.transaction_info.transaction_initiation_date;
      return q.transactionId
        ? t.transaction_info.transaction_id === q.transactionId
        : at >= q.startDate && at <= q.endDate;
    });
    return this.raw({
      transaction_details: rows,
      total_items: rows.length,
      total_pages: 1,
      page: 1,
      last_refreshed_datetime: this.now().toISOString(),
    });
  }

  async getOrder(id: string) {
    const o = this.data().orders.find((x) => x.id === id);
    if (!o) throw new NotFound(`order ${id}`);
    return this.raw(o);
  }

  async addTracking(orderId: string, input: unknown) {
    await this.getOrder(orderId);
    this.writes.push({ op: "addTracking", id: orderId, body: input });
    return this.raw({ id: orderId, status: "COMPLETED" }, 201);
  }

  async refundCapture(captureId: string, input: unknown) {
    this.writes.push({ op: "refundCapture", id: captureId, body: input });
    return this.raw({ id: `R-${captureId}`, status: "COMPLETED" }, 201);
  }

  /** Replay accepts only the fixture signature (13 section 4.2). */
  async verifyWebhook(headers: Record<string, string>) {
    return headers["paypal-transmission-sig"] === "fixture-valid"
      ? { ok: true, detail: "FIXTURE" }
      : { ok: false, detail: "FIXTURE_SIGNATURE_MISMATCH" };
  }
}
