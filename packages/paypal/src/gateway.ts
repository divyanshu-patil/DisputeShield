import type {
  PaypalDisputeDetails,
  PaypalDisputeList,
  PaypalOrder,
  PaypalTransactionSearch,
} from "@ds/schemas";
import type { EvidenceFile, EvidenceInput } from "./live/multipart.js";

// One interface, two adapters (architecture.md section 7): LiveGateway (sandbox) and ReplayGateway (fixtures).

export type Raw<T> = {
  status: number;
  body: T;
  debugId?: string;
  recordedAt: string;
};

export type ListDisputesQuery = {
  updateTimeAfter?: string;
  pageSize?: number;
  nextPageToken?: string;
};
export type TxnQuery = {
  startDate: string;
  endDate: string;
  transactionId?: string;
};
export type AcceptClaimInput = { note: string; accept_claim_type: "REFUND" };
export type AddTrackingInput = {
  capture_id: string;
  tracking_number: string;
  carrier: string;
  notify_payer: boolean;
};
export type RefundInput = {
  amount?: { currency_code: string; value: string };
  note_to_payer?: string;
};
export type WriteOpts = { requestId: string };

export interface PayPalGateway {
  readonly mode: "live" | "replay";
  listDisputes(q: ListDisputesQuery): Promise<Raw<PaypalDisputeList>>;
  getDispute(id: string): Promise<Raw<PaypalDisputeDetails>>;
  provideEvidence(
    id: string,
    input: EvidenceInput,
    files?: EvidenceFile[],
  ): Promise<Raw<unknown>>;
  acceptClaim(id: string, input: AcceptClaimInput): Promise<Raw<unknown>>;
  searchTransactions(q: TxnQuery): Promise<Raw<PaypalTransactionSearch>>;
  getOrder(id: string): Promise<Raw<PaypalOrder>>;
  addTracking(
    orderId: string,
    input: AddTrackingInput,
    opts: WriteOpts,
  ): Promise<Raw<unknown>>;
  refundCapture(
    captureId: string,
    input: RefundInput,
    opts: WriteOpts,
  ): Promise<Raw<unknown>>;
  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
    webhookId: string,
  ): Promise<{ ok: boolean; detail: string }>;
}
