#!/usr/bin/env tsx
import { Argument, Command } from "commander";
import { evalLive } from "./commands/eval-live.js";
import { runReplayCheck } from "./commands/replay-check.js";
import { seed } from "./commands/seed.js";
import { SPIKES, type SpikeOptions, runSpike } from "./commands/spike.js";

const program = new Command("ds").description(
  "Dispute Shield CLI: Day-0 spikes, seeding, fixtures, evals",
);

program
  .command("spike")
  .description("Run a Day-0 spike (docs/11-risks-and-day0-spikes.md)")
  .addArgument(new Argument("<id>", "spike id").choices(Object.keys(SPIKES)))
  .option(
    "--dispute <id>",
    "dispute id for s3/s4 (defaults to the S1 disputes)",
  )
  .option("--order <id>", "s7/s8: Orders API order id")
  .option("--carrier <name>", "s3/s8: carrier name (default USPS)")
  .option("--models <list>", "s9: comma-separated models (default LLM_MODEL)")
  .option("--runs <n>", "s9: drafter runs per model (default 5)")
  .option(
    "--toolkit",
    "s9 part 2: answer through the PayPal toolkit read tools",
  )
  .option("--file", "s3: attach a 1x1 PNG as a document part")
  .option(
    "--send",
    "send write requests (s3/s4/s7/s8); without it they are only printed",
  )
  .action((id: keyof typeof SPIKES, opts: SpikeOptions) => runSpike(id, opts));

program
  .command("seed:demo")
  .description(
    "Migrate, then reload the demo shop (DS-001..004, RISK-001..002)",
  )
  .option("--force", "with DS_MODE=live, wipe non-demo disputes too")
  .action((opts: { force?: boolean }) => seed(opts));

program
  .command("replay-check")
  .description("Check every fixture and scenario against @ds/schemas")
  .action(runReplayCheck);

program
  .command("eval:live")
  .description(
    "Run the drafter on the seeded demo facts with the live model; writes docs/evals/<date>.md",
  )
  .option("--runs <n>", "runs per scenario", "5")
  .option(
    "--record",
    "also save the first accepted draft per scenario as the replay recorded draft",
  )
  .action((opts: { runs: string; record?: boolean }) => evalLive(opts));

await program.parseAsync();
