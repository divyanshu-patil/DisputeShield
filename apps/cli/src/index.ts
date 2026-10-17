#!/usr/bin/env tsx
import { Argument, Command } from "commander";
import { SPIKES, runSpike } from "./commands/spike.js";

const program = new Command("ds").description(
  "Dispute Shield CLI: Day-0 spikes, seeding, fixtures, evals",
);

program
  .command("spike")
  .description("Run a Day-0 spike (docs/11-risks-and-day0-spikes.md)")
  .addArgument(new Argument("<id>", "spike id").choices(Object.keys(SPIKES)))
  .action((id: keyof typeof SPIKES) => runSpike(id));

await program.parseAsync();
