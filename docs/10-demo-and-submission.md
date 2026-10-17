# 10. Demo and submission

The rules say judges are not required to run the project and may judge from the text, images and video alone ✅, and "Presentation" is one of five equally weighted criteria ✅. Treat the video and the Devpost page as part of the product.

## 1. Rules that constrain the submission (from the official rules, read 2026-10-17 ✅)

| Requirement | What we do |
| --- | --- |
| Deadline 12 Nov 2026 12:00 pm PST = 13 Nov 01:30 IST | Target submit Wed 11 Nov ≈ 12:00 IST |
| No changes after the submission period ends (draft saves allowed before) | Save drafts on Devpost early; final check from a private window |
| Public repo on GitHub/Bitbucket/GitLab with an open-source licence file, visible in the repo's About section | MIT or Apache-2.0 at repo root; verify the badge shows |
| Working demo: hosted URL **or** clear setup and run instructions | Both: hosted replay demo + README quickstart |
| If the site is private, login credentials in the testing instructions | Put `DS_DEMO_ACCESS_CODE` in the testing instructions |
| Free access for judges until the judging period ends (judging runs 1–15 Dec ✅) | Keep hosting and DB alive to 15 Dec |
| Video under 3 minutes (judges need not watch past 3:00), public on YouTube, shows the project functioning, no third-party trademarks or copyrighted music/material without permission | See storyboard; no music or licensed music-free; avoid logos |
| Text description of features and functionality | Template below |
| Projects must be new or significantly updated during the submission period; explain how if pre-existing | New build; say so |
| One Grand/HM prize + one sponsor prize at most | Target Most Impactful or Best Use of PayPal + AI, plus Best Use of AG Grid |
| Materials in English | Yes |

Re-read the live rules the day before submitting; the ❓ items below may have changed.

## 2. Video: 2 min 50 s storyboard

Voiceover in plain English, recorded in one take per scene, captions burned in (judges may watch muted). 1920×1080, 30 fps. Record in **replay mode** for reliability, with one scene (or a short insert) from **live sandbox** if the rehearsal passed, labelled on screen.

| Time | Scene | On screen | Voiceover (draft) |
| --- | --- | --- | --- |
| 0:00–0:12 | Hook | Title card "Dispute Shield" then the queue with a red countdown | "A PayPal dispute is a ticking clock. For a small shop, missing it, or answering it badly, means losing the sale and the product." |
| 0:12–0:25 | Problem and user | Meera's shop name, three scattered sources (PayPal, tracking page, spreadsheet) as simple icons | "Meera runs a small ceramics shop. The facts she needs are in three places, and she has hours, not days." |
| 0:25–0:45 | Queue | Dispute Queue sorted by time left, strength badges, amount at risk, mode banner "Replay (recorded sandbox data)" | "Dispute Shield syncs from PayPal by webhook and polling and puts the nearest deadline first, with the money at risk and how strong her evidence is." |
| 0:45–1:15 | Case file and draft | Open DS-001; facts list with sources; checklist; draft with citation chips; click a chip to show the PayPal JSON snippet | "Every fact comes from PayPal or her own file. The AI drafts the response, but each sentence must cite a fact." |
| 1:15–1:40 | The verifier (key moment) | Edit a sentence to say a wrong tracking number or "delivered on 28 September"; verifier flags VALUE_MISMATCH; revert | "If the AI, or a person, writes something the records do not support, the verifier removes it. The AI cannot invent evidence." |
| 1:40–2:05 | Decision and approval | Decision panel (Fight, why, amount, time left); approve modal with the exact request; checkbox; send | "She sees why we recommend fighting, reviews the exact request to PayPal, and approves. Nothing is sent without her." |
| 2:05–2:20 | Result | Submission result; if live: PayPal 2xx and webhook updates the case; else dry-run snapshot labelled | "Evidence is submitted through PayPal's Disputes API and the case updates when the webhook arrives." |
| 2:20–2:35 | Prevent | Risk Radar with two flags; click Add tracking; preview | "The best dispute is the one that never happens. Dispute Shield flags unshipped, untracked or unprotected orders and fixes them before the buyer complains." |
| 2:35–2:48 | Health dashboard | AG Studio dashboard, Deadline runway widget, Verifier ledger | "A dashboard built with AG Grid and AG Studio shows what is due and how the AI is performing." |
| 2:48–2:55 | Close | URL, "open source, sandbox only, MIT" | "Open source, built on PayPal's APIs, and honest about what it does not do yet." |

Guidelines:
- Show a real working flow without cuts at the key moments (approval, verifier).
- If a scene uses recorded data, say so on screen; do not imply live production use.
- Never show real names, real addresses, tokens or client secrets. Use the synthetic data only; scrub the browser URL bar and console.
- No claim about win rates, savings or percentages unless the number is in the README with a source link.
- Do not show PayPal logos or other trademarks; the PayPal APIs can be named in text. Avoid showing PayPal's own UI unless unavoidable, and if shown, keep it brief and unbranded where possible ❓ (the rule is about third-party trademarks and copyrighted material without permission; the safest reading is to avoid logos).
- No background music, or music you created or have a licence for.

### Recording checklist
1. Fresh seeded database; browser zoom 110%; hide bookmarks; do-not-disturb on.
2. Dry run the full script twice, timing each scene.
3. Record screen and audio separately if possible; cut silences, not content.
4. Burn captions; check contrast.
5. Export 1080p; upload to YouTube as **Public** (not unlisted) ✅ rule says publicly visible.
6. Open the video logged out on another device; confirm duration < 3:00.
7. Paste the link in the Devpost form and in the README.

## 3. Live demo / judge path (in the README and the Devpost testing instructions)

Replay quickstart (no credentials), five commands or fewer:

```bash
git clone <repo> && cd dispute-shield
corepack enable && pnpm install
docker compose up -d
cp .env.example .env && pnpm db:migrate && pnpm seed:demo
pnpm dev   # open http://localhost:3000, access code: change-me
```

Hosted demo: URL + access code in the testing instructions.

The 90-second judge path (AC-DEMO-02):
1. Log in with the access code.
2. Click DS-001 (Time left shows urgent).
3. See facts → click a citation chip → source drawer.
4. Click **Approve & send evidence** → tick the box → **Store (dry run)**.
5. Open **Risk** → click **Scan now** → open a flag → **Add tracking** preview.
6. Open **Health** for the dashboard.

Live-sandbox instructions (optional, for judges with their own sandbox): `docs/runbooks/go-live-sandbox.md` lists the PayPal app settings, the three webhook events, and the environment variables.

## 4. Devpost text template

Keep claims factual and checkable. Replace bracketed items; delete anything unsupported.

**Title:** Dispute Shield

**Tagline:** Answer every PayPal dispute on time, with evidence you can prove, and stop the next one before it starts.

**Inspiration / problem**
> Small online sellers get PayPal disputes with a short response window. The evidence is scattered across PayPal, shipping and spreadsheets, and a wrong or missing detail can cost the case. [One sourced statistic with a link, only if found.] Many disputes trace back to avoidable gaps: no tracking on PayPal, mismatched addresses, unprotected payments.

**What it does**
> Dispute Shield is an open-source dispute desk. Respond: it collects facts from PayPal's Disputes, Transaction Search and Orders APIs plus the seller's fulfilment CSV, scores evidence strength with a fixed checklist, drafts a response with an LLM in which every sentence cites a fact, and runs a deterministic verifier that removes anything the records do not support. The owner approves the exact request before it is sent (or accepts the claim). Prevent: it scans transactions for gaps and lets the owner add tracking or refund proactively. A health dashboard built with AG Grid and AG Studio shows deadlines and verifier performance.

**How we built it**
> Turborepo monorepo (TypeScript, Next.js 16, Postgres/Drizzle). A PayPal gateway with live and replay adapters; signature-verified, idempotent webhooks with a Postgres job queue; direct REST calls for disputes (evidence, accept claim), tracking and refunds; `@paypal/agent-toolkit` for read-only copilot tools. AI SDK for drafting with schema-constrained output, one repair retry and a template fallback. [Eval results from `docs/evals/<date>.md`, only if run.]

**Challenges**
> [Honest list: sandbox dispute creation, multipart evidence upload quirks, webhook ordering, making the AI accountable.]

**Accomplishments**
> [Verifier rejects 100% of our adversarial set; end-to-end flow from webhook to submitted evidence; dry-run exact-request preview.]

**What we learned / what's next**
> [Multi-merchant OAuth, more dispute reasons, carrier integrations.]

**How PayPal is used (explicit for judges)**
> Disputes API (list, details, provide-evidence, accept-claim, [make-offer]); Webhooks (CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED with signature verification); Transaction Search; Orders v2 and shipment tracking; Refunds; `@paypal/agent-toolkit` (read tools) with AI. Sandbox only.

**How AG Grid / AG Studio are used**
> AG Grid: dispute queue, risk radar, audit log, fulfilment table. AG Studio: Health dashboard with two custom widgets, themed from the app's design tokens.

**Limits (say them)**
> Sandbox only; supports item-not-received and refund-based evidence; strength is a checklist, not a prediction; Transaction Search data can be up to 3 hours old.

**Built with:** TypeScript, Next.js, React, Turborepo, pnpm, Postgres, Drizzle, Vercel AI SDK, [LLM provider], PayPal REST APIs, PayPal Agent Toolkit, AG Grid, AG Studio, Tailwind CSS, Playwright, Vitest.

**Links:** GitHub repo, hosted demo, YouTube video.

**Testing instructions:** hosted URL + access code; or the five-command quickstart; note that the hosted demo runs on recorded sandbox data and is labelled so; live sandbox instructions are in the repo.

**Images:** queue screenshot, case workspace with citations, verifier rejection, risk radar, dashboard. Use 3:2 images as Devpost requires ❓ (check the form).

**Prize selections:** Honorable Mention (Most Impactful or Best Use of PayPal + AI, choose one) and Best Use of AG Grid. Follow the "one Grand/HM + one sponsor" rule ✅.

## 5. How to explain the AI honestly

- Say "drafts" and "verifies", not "decides".
- Say what the verifier checks (numbers, dates, IDs, citations) and what it does not (it cannot prove a fact is true; it proves the text matches the records).
- Say when output is recorded (replay) vs live.
- Quote eval numbers only from the saved eval file.

## 6. Final submission checklist (Tue 10 – Wed 11 Nov)

- [ ] CI green on `main`; tag `v1.0.0`.
- [ ] Repo public; LICENSE detected in About; README quickstart works on a second machine.
- [ ] No secrets in history (gitleaks clean).
- [ ] Hosted demo up, code works, replay label visible, DB retention covers 15 Dec.
- [ ] AG Studio trial start date recorded; ends after 15 Dec.
- [ ] Video public, under 3:00, plays logged out; link in README and Devpost.
- [ ] Devpost text complete, claims sourced, limits listed.
- [ ] Images uploaded; built-with tags set; prize selections correct.
- [ ] Testing instructions include access code.
- [ ] Eligibility re-checked against the official rules (country, age, team rules) ❓ (not verified in this pack).
- [ ] Representative named if a team ✅ (rules require one).
- [ ] Submit by Wed 11 Nov ≈ 12:00 IST. Open the public submission in a private window and click every link.
- [ ] After submit: no further changes (not allowed after the deadline ✅). Keep the demo healthy through 15 Dec.

## 7. Contingency plans

| Failure | Response |
| --- | --- |
| Sandbox down or evidence upload fails on recording day | Record in replay mode; label it; mention live rehearsal logs in the repo |
| LLM provider down | Template fallback is a feature: show the banner in the video as a resilience point if needed |
| Hosted DB expires or sleeps | Move to a paid/always-on tier for a month, or switch to profile B instructions; add a daily uptime check |
| AG Studio unusable | Use the fallback dashboard (AG Grid + simple charts); say so honestly in the text |
| Video over 3:00 | Cut Prevent to 10 s and Health to 8 s; the verifier scene stays |
| Devpost upload error near deadline | Keep a complete text draft saved locally; submit early (the plan has 37 h buffer) |
