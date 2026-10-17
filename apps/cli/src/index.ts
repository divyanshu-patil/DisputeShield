#!/usr/bin/env tsx
import { Command } from "commander";

const program = new Command("ds").description(
  "Dispute Shield CLI: Day-0 spikes, seeding, fixtures, evals",
);

program.parse();
