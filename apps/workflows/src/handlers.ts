import type { JobHandlers } from "@ds/jobs";

/**
 * Composition root for the workflow service: builds the real handlers from @ds/db, @ds/paypal,
 * @ds/core and @ds/agent. Same handlers the API's Postgres worker uses (plan task P2-8).
 *
 * Until those packages exist this returns none, so every task fails with JobNotImplementedError
 * and Render shows the error in the run history instead of pretending to work.
 */
export function buildHandlers(): JobHandlers {
  return {};
}
