// provide-evidence multipart body (docs/03-paypal-api-contract.md 2.3, Q2).
// Form A from the integration guide: a JSON part named `input`, then document parts. Confirmed in S3
// (with and without a `file1` part, docs/decisions/0001); form B (`evidence-file`) was not needed.

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

export type EvidenceFile = { name: string; type: string; data: Uint8Array };

/** Form A. Document parts are named `file1`, `file2`, … (`file1` confirmed in S3). */
export function evidenceFormA(
  input: EvidenceInput,
  files: EvidenceFile[] = [],
): FormData {
  const form = new FormData();
  form.append(
    "input",
    new Blob([JSON.stringify(input)], { type: "application/json" }),
  );
  files.forEach((f, i) =>
    form.append(`file${i + 1}`, new Blob([f.data], { type: f.type }), f.name),
  );
  return form;
}
