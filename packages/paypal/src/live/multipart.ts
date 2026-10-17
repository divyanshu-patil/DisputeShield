// provide-evidence multipart body (docs/03-paypal-api-contract.md 2.3, Q2).
// Form A from the integration guide: a JSON part named `input`, then document parts. Spike S3 decides
// whether this form or form B (single `evidence-file` field) is the one PayPal accepts.

export type EvidenceInput = {
  evidences: {
    evidence_type: "PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER";
    evidence_info?: {
      tracking_info?: { carrier_name: string; tracking_number: string }[];
      refund_ids?: string[];
    };
    notes?: string;
  }[];
};

export function evidenceFormA(input: EvidenceInput): FormData {
  const form = new FormData();
  form.append(
    "input",
    new Blob([JSON.stringify(input)], { type: "application/json" }),
  );
  return form;
}
