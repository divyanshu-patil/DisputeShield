# 12. Start prompts for your coding agent

Use these in order. Each is self-contained. Put the pack in the repo as follows before you start:

```text
dispute-shield/
├─ AGENTS.md            ← from the pack
├─ CLAUDE.md            ← from the pack
└─ docs/                ← every other file from the pack (architecture.md, 01…12)
```

## Prompt 0 — Orientation (no code)

```text
You are working on Dispute Shield, an open-source PayPal dispute desk for a hackathon.
Read AGENTS.md, then docs/architecture.md, docs/07-implementation-plan.md and docs/11-risks-and-day0-spikes.md.

Do not write code yet. Reply with:
1. A five-line summary of the product and the non-negotiable rules.
2. The Phase 0 task list in order, with what I (the human) must do by hand (accounts, dashboard clicks) and what you can do.
3. Anything in the docs that is ambiguous or conflicts, as a numbered list with your proposed default for each.
Keep it under 400 words.
```

## Prompt 1 — Repo skeleton (P0-1)

```text
Task P0-1 from docs/07-implementation-plan.md: create the Turborepo skeleton.
Read AGENTS.md and docs/02-monorepo-structure.md.

Build exactly the structure in section 1 of 02-monorepo-structure.md with empty-but-valid packages:
- pnpm workspace, root package.json, turbo.json (use the `tasks` key), tsconfig bases, ESLint flat config with the boundary rules in section 3, Prettier, .nvmrc (Node 20.9+), .gitignore, .env.example, docker-compose.yml.
- Each package has package.json (just-in-time exports), tsconfig.json, src/index.ts exporting nothing yet, and one trivial passing Vitest test.
- apps/web is a minimal Next.js app that renders "Dispute Shield" and has transpilePackages set.
- apps/cli runs `pnpm ds --help` through tsx.
- GitHub Actions ci.yml per section 5 (lint, typecheck, test; Playwright step can be commented until e2e exists).
- An MIT LICENSE file with the holder name as a placeholder I will fill in.

Use the latest stable versions of tools, but for next/react/ag-grid/ag-studio/tailwind use the versions in docs/02-monorepo-structure.md. Pin what you install.
Done when: `pnpm install && pnpm turbo run lint typecheck test` passes, `pnpm dev` serves the page, and CI config is valid.
Report: commands you ran, versions installed, anything that deviated from the doc and why.
```

## Prompt 2 — Day-0 spikes (P0-2 … P0-9)

```text
Day-0 spikes. Read AGENTS.md, docs/03-paypal-api-contract.md and docs/11-risks-and-day0-spikes.md.

I will give you sandbox credentials in .env myself. I have/have not completed S0 (say which).
Implement `pnpm ds spike <id>` for S0 to S8 as described. Rules:
- Never print secrets or tokens.
- Save every successful response through the redactor into packages/fixtures, and print file paths.
- On every failure print status, PayPal debug_id and the redacted error body. Do not retry beyond what the spike says.
- After each spike, propose the exact edits to docs/03-paypal-api-contract.md (change ❓/⚠️ to ✅ with date and fixture name, or record the failure). Show me the edits; do not make them silently.
Start with S0 and S2 only, then stop and show me results. Do not start S3 until I say so.
```

## Prompt 3 — Foundations (Phase 1)

```text
Phase 1 from docs/07-implementation-plan.md. Read AGENTS.md, docs/architecture.md, docs/04-data-model.md, docs/03-paypal-api-contract.md and docs/08-acceptance-criteria.md (AC-WH, AC-SYNC).

Implement in this order, one commit per row, running lint/typecheck/tests for touched packages after each:
P1-2 schemas → P1-3 db schema + migration + repos → P1-4 job queue → P1-5 gateway interface + LiveGateway (auth, list, get) + recorder/redactor → P1-6 ReplayGateway + DS-001/DS-002 fixtures → P1-7 webhook endpoint → P1-8 cron tick + sync jobs → P1-9 shell/auth/ModeBanner → P1-10 queue page → P1-11 health.

Stop after P1-6 and show me a summary before continuing to P1-7. At the end list which acceptance IDs now pass and how each was checked.
```

## Prompt 4 — Respond core (Phase 2)

```text
Phase 2 from docs/07-implementation-plan.md. Read AGENTS.md, docs/05-evidence-engine-spec.md in full, docs/08-acceptance-criteria.md (AC-CASE, AC-EVID, AC-VER, AC-DEC, AC-SUB), and the spike results in docs/decisions/.

Start with the verifier (P2-4). Write the tests from docs/09-test-plan.md section 2.1 FIRST, watch them fail, then implement. Do not move on until every listed test and the property tests pass.
Then continue P2-1, P2-3, P2-5, P2-7 (all in packages/core, no I/O), then P2-6 (drafter), P2-8, P2-9, P2-10, P2-11, P2-12.
Do not weaken the verifier to make anything pass. If a spec rule seems wrong, stop and tell me.
After each numbered task: summary of acceptance IDs now satisfied, tests added, anything skipped.
```

## Prompt 5 — Prevent and dashboard (Phase 3)

```text
Phase 3 from docs/07-implementation-plan.md. Read AGENTS.md, docs/06-ui-spec.md sections 5 and 6, docs/05-evidence-engine-spec.md section 8, and AC-RISK / AC-UI-09.
Implement P3-1 … P3-5. Do P3-7 and P3-8 only if I say so.
For the AG Studio dashboard use the findings from spike S10 in docs/decisions/. If the custom widget API is not available, stop and propose the fallback in docs/06-ui-spec.md section 6 before building anything.
```

## Prompt 6 — Hardening (Phase 4)

```text
Phase 4. Read docs/09-test-plan.md in full and docs/08-acceptance-criteria.md.
1. Build `docs/acceptance-status.md`: a table of every AC ID with Status (pass/fail/not-run), How verified, Evidence link.
2. Write the Playwright specs in section 6 of the test plan and the security tests in section 8.
3. Fix gaps you find; list anything you could not fix.
4. Write the README for judges per docs/10-demo-and-submission.md section 3 (five-command replay quickstart, architecture diagram from architecture.md, limits, licence, how to go live in the sandbox).
Do not add features.
```

## Prompt 7 — Review pass (any time)

```text
Act as a strict reviewer of the changes since <commit>. Read AGENTS.md and the specs for the touched packages.
Report only real problems, ranked: (1) violations of the non-negotiable rules in AGENTS.md section 2, (2) failing or missing tests for claimed acceptance IDs, (3) PayPal parameters not backed by docs/03 with ✅, (4) boundary violations, (5) security/privacy issues, (6) anything that would make the demo flaky.
For each: file and line, what is wrong, a concrete failing scenario, and the minimal fix. Do not rewrite code unless I ask.
```

## Tips for using agents on this project

- One task row per session. Long sessions drift; start a fresh one per phase.
- Paste the task row and the acceptance IDs into the prompt; do not say "build the app".
- When the agent asks about a PayPal behaviour, answer from sandbox results, not from memory.
- Commit often; revert rather than patch when an agent goes off-plan.
- Keep `docs/` as the single source of truth and update it in the same commit as behaviour changes.
