import { SCENARIO_IDS, type ScenarioData } from "@ds/fixtures";
import type { Repos } from "@ds/db";
import type { Pipeline } from "./pipeline.js";

// `seed:demo` (04 section 5): reset case data, load the seller's pre-imported fulfilment rows, then run
// the jobs inline so DS-001 opens with a stored draft (06: draft visible in under two seconds).

export class SeedRefusedError extends Error {
  override name = "SeedRefusedError";
}

export async function seedDemo(o: {
  repos: Repos;
  pipeline: Pipeline;
  data: ScenarioData;
  mode: "live" | "replay";
  force?: boolean;
}) {
  if (
    o.mode === "live" &&
    !o.force &&
    (await o.repos.demo.nonFixtureDisputes([...SCENARIO_IDS])) > 0
  ) {
    throw new SeedRefusedError(
      "The database holds non-demo disputes and DS_MODE=live. Pass --force to wipe them.",
    );
  }
  await o.repos.demo.reset();
  const csv = [
    "order_ref,paypal_transaction_id,carrier,tracking_number,shipped_at,delivered_at,last_scan_at,ship_to_name,ship_to_line1,ship_to_city,ship_to_postal,ship_to_country",
  ];
  for (const f of o.data.fulfilment) {
    csv.push(
      [
        f.order_ref,
        f.paypal_transaction_id,
        f.carrier,
        f.tracking_number,
        f.shipped_at,
        f.delivered_at,
        f.last_scan_at,
        "",
        "",
        "",
        f.ship_to_postal,
        f.ship_to_country,
      ].join(","),
    );
  }
  await o.pipeline.importFulfilment(csv.join("\n"));
  await o.pipeline.syncDisputes(false);
  const cases: Record<string, string> = {};
  for (const id of SCENARIO_IDS) {
    const r = await o.pipeline.collectCase(id);
    cases[id] = r.state;
    if (r.state === "READY") await o.pipeline.draftCase(r.caseId);
  }
  const risk = await o.pipeline.scanTransactions(30);
  await o.repos.audit.append({
    actor: "cli",
    action: "DEMO_SEEDED",
    detail: { cases, flagged: risk.flagged },
  });
  return { cases, flagged: risk.flagged };
}
