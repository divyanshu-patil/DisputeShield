import type {
  PaypalDisputeDetails,
  PaypalOrder,
  PaypalTransactionDetail,
} from "@ds/schemas";

// Synthetic demo scenarios for the fictional shop Hearthside Ceramics (01 product brief, 08 header).
// Dates are built relative to `now`, so the demo's deadlines never go stale. Every object parses against
// @ds/schemas (test/scenarios.test.ts). No real person, address or account appears here.

export type FulfilmentSeed = {
  order_ref: string;
  paypal_transaction_id: string;
  carrier: string;
  tracking_number: string;
  shipped_at: string;
  delivered_at: string;
  last_scan_at: string;
  ship_to_postal: string;
  ship_to_country: string;
};

export type ScenarioData = {
  disputes: PaypalDisputeDetails[];
  transactions: PaypalTransactionDetail[];
  orders: PaypalOrder[];
  /** Rows loaded by `seed:demo` (the seller imported these before the demo). */
  fulfilment: FulfilmentSeed[];
  /** The CSV the owner uploads during the demo to fix DS-002 (AC-CASE-05). */
  demoCsv: string;
};

export const SCENARIO_IDS = ["DS-001", "DS-002", "DS-003", "DS-004"] as const;
export const RISK_IDS = ["RISK-001", "RISK-002"] as const;

const H = 3_600_000;
const BASE = "https://api-m.sandbox.paypal.com";

type Spec = {
  id: string;
  reason: string;
  amount: string;
  txn: string;
  order: string;
  capture: string;
  item: string;
  postal: string;
  paidH: number; // hours before now
  openedH: number;
  dueH: number; // hours after now
  tracker?: string;
  refund?: { id: string; hoursAgo: number };
  protection: "01" | "02" | "03";
};

const SPECS: Spec[] = [
  {
    id: "DS-001",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    amount: "48.00",
    txn: "5TY05013RG002845M",
    order: "3HW91836KY152471N",
    capture: "8MC58560J2207183K",
    item: "Speckled mug (set of 2)",
    postal: "95131",
    paidH: 12 * 24,
    openedH: 6 * 24,
    dueH: 20,
    tracker: "1Z999AA10123456784",
    protection: "01",
  },
  {
    id: "DS-002",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    amount: "129.00",
    txn: "7KD23419UA330918F",
    order: "5JX40217PV883920B",
    capture: "2BN77104KS558326W",
    item: "Stoneware serving bowl",
    postal: "97205",
    paidH: 9 * 24,
    openedH: 4 * 24,
    dueH: 5.2,
    protection: "01",
  },
  {
    id: "DS-003",
    reason: "CREDIT_NOT_PROCESSED",
    amount: "36.00",
    txn: "2PL61837CN447201T",
    order: "9TR15528MD604117H",
    capture: "6WQ30982EA771459D",
    item: "Glazed planter",
    postal: "60614",
    paidH: 14 * 24,
    openedH: 5 * 24,
    dueH: 6 * 24,
    refund: { id: "1RF44205GH318267C", hoursAgo: 7 * 24 },
    protection: "01",
  },
  {
    id: "DS-004",
    reason: "UNAUTHORISED",
    amount: "64.00",
    txn: "4UV82276HB019538Q",
    order: "8KM63309TC245170X",
    capture: "3XP19945RL806624M",
    item: "Hand-thrown vase",
    postal: "30307",
    paidH: 6 * 24,
    openedH: 2 * 24,
    dueH: 10 * 24,
    protection: "01",
  },
];

const RISKS: (Omit<Spec, "reason" | "openedH" | "dueH"> & {
  csvPostal?: string;
  csvTracking?: string;
})[] = [
  {
    id: "RISK-001",
    amount: "158.00",
    txn: "6HC90413WD527718A",
    order: "2QA58810NE336409Y",
    capture: "7LT22618JF905531P",
    item: "Dinner plate set",
    postal: "95131",
    paidH: 30,
    protection: "02",
    csvPostal: "10001",
    csvTracking: "1Z999AA10198765432",
  },
  {
    id: "RISK-002",
    amount: "42.00",
    txn: "9GS37756XK118843E",
    order: "4VB20094QM770215L",
    capture: "5ZE61473YP402986K",
    item: "Espresso cups (set of 4)",
    postal: "78704",
    paidH: 50,
    protection: "01",
  },
];

export function buildScenarios(now: Date = new Date()): ScenarioData {
  const at = (hoursFromNow: number) =>
    new Date(Math.round((now.getTime() + hoursFromNow * H) / 1000) * 1000)
      .toISOString()
      .replace(".000Z", "Z");
  const day = (hoursFromNow: number) => at(hoursFromNow).slice(0, 10);

  const dispute = (s: Spec): PaypalDisputeDetails => {
    const self = `${BASE}/v1/customer/disputes/${s.id}`;
    const post = (rel: string, path: string) => ({
      href: `${self}/${path}`,
      rel,
      method: "POST",
    });
    return {
      dispute_id: s.id,
      create_time: at(-s.openedH),
      update_time: at(-s.openedH + 1),
      reason: s.reason,
      status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_state: "REQUIRED_ACTION",
      dispute_life_cycle_stage: "INQUIRY",
      dispute_channel: "INTERNAL",
      dispute_amount: { currency_code: "USD", value: s.amount },
      seller_response_due_date: at(s.dueH),
      disputed_transactions: [
        {
          buyer_transaction_id: `B${s.txn.slice(1)}`,
          seller_transaction_id: s.txn,
          create_time: at(-s.paidH),
          transaction_status: "HELD",
          gross_amount: { currency_code: "USD", value: s.amount },
          items: [
            {
              item_name: s.item,
              item_quantity: "1",
              item_type: "PRODUCT",
              reason: s.reason,
            },
          ],
          seller_protection_eligible: true,
          buyer: { name: "Jordan Avery", email: "buyer@example.com" },
          seller: { name: "Hearthside Ceramics", email: "seller@example.com" },
        },
      ],
      allowed_response_options: {
        accept_claim: { accept_claim_types: ["REFUND"] },
      },
      links: [
        { href: self, rel: "self", method: "GET" },
        post("accept_claim", "accept-claim"),
        post("provide_evidence", "provide-evidence"),
        post("send_message", "send-message"),
        post("make_offer", "make-offer"),
      ],
    };
  };

  const txn = (s: {
    txn: string;
    order: string;
    amount: string;
    paidH: number;
    protection: string;
    postal: string;
    item: string;
  }): PaypalTransactionDetail => ({
    transaction_info: {
      transaction_id: s.txn,
      transaction_event_code: "T0000",
      transaction_initiation_date: at(-s.paidH),
      transaction_updated_date: at(-s.paidH),
      transaction_amount: { currency_code: "USD", value: s.amount },
      transaction_status: "S",
      protection_eligibility: s.protection as "01",
      paypal_reference_id: s.order,
      paypal_reference_id_type: "ODR",
    },
    shipping_info: {
      name: "Jordan Avery",
      address: {
        line1: "1 Test Street",
        city: "San Jose",
        postal_code: s.postal,
        country_code: "US",
      },
    },
    cart_info: { item_details: [{ item_name: s.item }] },
  });

  const order = (s: {
    order: string;
    capture: string;
    amount: string;
    postal: string;
    item: string;
    tracker?: string;
    refund?: { id: string; hoursAgo: number };
  }): PaypalOrder => ({
    id: s.order,
    status: "COMPLETED",
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "default",
        amount: { currency_code: "USD", value: s.amount },
        items: [{ name: s.item }],
        shipping: {
          name: { full_name: "Jordan Avery" },
          address: {
            address_line_1: "1 Test Street",
            admin_area_2: "San Jose",
            postal_code: s.postal,
            country_code: "US",
          },
          ...(s.tracker
            ? {
                trackers: [
                  { id: `${s.capture}-${s.tracker}`, status: "SHIPPED" },
                ],
              }
            : {}),
        },
        payments: {
          captures: [
            {
              id: s.capture,
              status: s.refund ? "REFUNDED" : "COMPLETED",
              amount: { currency_code: "USD", value: s.amount },
            },
          ],
          ...(s.refund
            ? {
                refunds: [
                  {
                    id: s.refund.id,
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: s.amount },
                    create_time: at(-s.refund.hoursAgo),
                  },
                ],
              }
            : {}),
        },
      },
    ],
    links: [
      {
        href: `${BASE}/v2/checkout/orders/${s.order}`,
        rel: "self",
        method: "GET",
      },
    ],
  });

  const ds001 = SPECS[0];
  const ds002 = SPECS[1];
  const risk001 = RISKS[0];
  if (!ds001 || !ds002 || !risk001) throw new Error("scenario table is empty");

  const fulfilment: FulfilmentSeed[] = [
    {
      order_ref: "HC-1001",
      paypal_transaction_id: ds001.txn,
      carrier: "UPS",
      tracking_number: ds001.tracker ?? "",
      shipped_at: day(-11 * 24),
      delivered_at: day(-8 * 24),
      last_scan_at: day(-8 * 24),
      ship_to_postal: ds001.postal,
      ship_to_country: "US",
    },
    {
      order_ref: "HC-1101",
      paypal_transaction_id: risk001.txn,
      carrier: "UPS",
      tracking_number: risk001.csvTracking ?? "",
      shipped_at: day(-24),
      delivered_at: "",
      last_scan_at: day(-20),
      ship_to_postal: risk001.csvPostal ?? "",
      ship_to_country: "US",
    },
  ];
  const csvRows = [
    "order_ref,paypal_transaction_id,carrier,tracking_number,shipped_at,delivered_at,last_scan_at,ship_to_name,ship_to_line1,ship_to_city,ship_to_postal,ship_to_country",
    `HC-1002,${ds002.txn},USPS,9400111899223817565499,${day(-8 * 24)},${day(-5 * 24)},${day(-5 * 24)},Jordan Avery,1 Test Street,Portland,${ds002.postal},US`,
  ];

  return {
    disputes: SPECS.map(dispute),
    transactions: [...SPECS, ...RISKS].map(txn),
    orders: [...SPECS, ...RISKS].map(order),
    fulfilment,
    demoCsv: `${csvRows.join("\n")}\n`,
  };
}
