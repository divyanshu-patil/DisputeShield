import { Render } from "@renderinc/sdk";
import { workflowSlug } from "./env.js";

// Workflows have no native schedule ✅ (docs), so a Render cron job runs this every 5 minutes:
//   schedule: "*/5 * * * *", startCommand: node apps/workflows/dist/trigger.js
// Needs RENDER_API_KEY and RENDER_WORKFLOW_SLUG.

async function main(): Promise<void> {
  const slug = workflowSlug();

  const render = new Render(); // reads RENDER_API_KEY
  // Same key for 5-minute buckets: a cron retry in the same window does not start a second run.
  const bucket = Math.floor(Date.now() / 300_000);
  const run = await render.workflows.startTask(`${slug}/sync_disputes`, [{}], {
    idempotencyKey: `cron:sync_disputes:${bucket}`,
  });
  console.log(
    JSON.stringify({ started: "sync_disputes", taskRunId: run.taskRunId }),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
