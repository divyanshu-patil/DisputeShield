#!/usr/bin/env tsx
import { Argument, Command } from "commander";
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
  .option("--carrier <name>", "s3: carrier_name (default USPS)")
  .option("--file", "s3: attach a 1x1 PNG as a document part")
  .option(
    "--send",
    "send write requests (s3/s4); without it they are only printed",
  )
  .action((id: keyof typeof SPIKES, opts: SpikeOptions) => runSpike(id, opts));

await program.parseAsync();
