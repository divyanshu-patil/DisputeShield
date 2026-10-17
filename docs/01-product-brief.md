# 01. Product brief

## 1. One-line pitch

**Dispute Shield** is an open-source dispute desk for small PayPal sellers: it helps them answer every dispute on time with evidence they can prove, and helps them fix the order gaps that cause disputes in the first place.

## 2. The problem and the person

**Who:** the owner or operations person of a small online shop that takes PayPal. One to five people, no dedicated finance or risk team. Named persona for the demo: "Meera, runs Hearthside Ceramics" (fictional shop and person).

**What hurts:**
1. A dispute arrives with a response deadline. The facts needed to answer (payment, shipping, tracking, delivery, refund) live in several places: PayPal, the shipping system, a spreadsheet, an inbox.
2. Writing a convincing, accurate response is slow, and unforced errors (wrong tracking number, missing carrier, late response) lose cases that could have been won.
3. Many disputes are avoidable: orders shipped without tracking uploaded to PayPal, to an address that differs from the order, or sitting unshipped.

**What they do today (to confirm in interviews or sources; not verified here ❓):** work from PayPal's Resolution Center, copy data by hand, write a note, hope.

**Evidence to find before quoting any statistic in the submission:** dispute volumes and win rates for small sellers. This pack contains **no** statistics. Any number in the Devpost text must carry a source link found during the build (see playbook rule "no unsourced numbers").

## 3. What it does

Two halves, one product.

### Respond (the core)

```text
dispute arrives → collect facts → checklist and strength → AI drafts citation-backed evidence
 → deterministic verifier removes anything unsupported → decision aid → owner approves → submit or accept claim
```

- Pulls the dispute, the payment and the order from PayPal, plus the seller's fulfilment CSV.
- Builds a **case file of facts**, each tagged with where it came from.
- Scores evidence **strength** (STRONG / MEDIUM / WEAK) from a fixed checklist. It is a checklist, not a probability.
- An LLM drafts the evidence text, but **every sentence must cite facts, and a verifier checks every number, date and ID** against those facts. Unsupported sentences are removed; if the model fails, a plain template is used.
- The owner sees a **decision aid** (fight, accept, or review) with reasons, amount at risk and time left.
- **Nothing is sent without explicit approval** of the exact request, shown on screen.

### Prevent (the differentiator)

- Scans recent transactions for gaps that weaken future cases: not protection-eligible (`R-PROT`), ship-to mismatch (`R-ADDR`), no tracking after 48 h (`R-NOTRACK`), stuck tracking (`R-STUCK`), high value (`R-HIGH`).
- Lets the owner add tracking to PayPal, proactively refund, or dismiss, each with a preview and approval.

## 4. Why it can score on each judging criterion

The five criteria are equally weighted ✅ (Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation). Honest statements of what the product must show, not predictions of a score.

| Criterion | What Dispute Shield must demonstrate |
| --- | --- |
| Technological Implementation (first tie-breaker ✅) | Real depth on PayPal's Disputes, Transaction Search, Orders/tracking and Webhooks APIs; signature-verified, idempotent webhooks; a job queue; an AI pipeline with a deterministic verifier and measured evals; record/replay gateway; tests. The `@paypal/agent-toolkit` has no evidence-upload or accept-claim tools ✅, so the depth comes from our own REST client. |
| Design | One coherent workflow from deadline queue to approved submission; citations you can click; exact-request preview; consistent theme across AG Grid and AG Studio; accessible and responsive. |
| Potential Impact | A specific user with a specific recurring problem; time and money at stake shown per case; the Prevent half addresses causes, not only symptoms. Statistics must be sourced before use. |
| Innovation/Idea | "AI that cannot invent evidence": enforced citations plus a verifier; combining respond and prevent in one open-source tool aimed at small sellers. A novelty claim needs a rival search trail; none is asserted here beyond what the ideation document recorded. |
| Presentation | A 3-minute video that shows a real deadline, a case file, a draft with citations, the verifier rejecting a fabricated line, approval, and the result. Clear problem, user, why it matters. |

## 5. Prize targets

Rules ✅: a project can win at most one Grand Prize and one Sponsor Prize, **or** one Honorable Mention and one Sponsor Prize.

| Target | Prize | Why plausible | Dependency |
| --- | --- | --- | --- |
| Primary | **Most Impactful** (Honorable Mention, $5,000) or a Grand Prize | the story is a real seller problem with real deadlines | strong Potential Impact narrative with sourced numbers |
| Alternate HM | **Best Use of PayPal + AI** ($5,000) | Disputes API depth + verified AI drafting | working live sandbox flow, evals shown |
| Sponsor | **Best Use of AG Grid** (1st $5,000 / 2nd $2,000 / 3rd $1,000 ×3) ✅ eligible if "any AG Grid tools" are used | AG Grid for the queue and risk radar, AG Studio for the Health dashboard with two custom widgets | AG Studio trial started on 1 Nov; dashboard polished |

Not targeted: Best Use of Agentic Commerce (this product is not a buyer-side agentic checkout), Channel3, Render, APIMatic, Bryntum. Using only one sponsor's tools keeps the submission focused and avoids the trial-expiry problem for Bryntum.

Re-read the live rules page before submitting; prize names and amounts above are from the rules text read on 2026-10-17.

## 6. Scope

### In scope (MVP)
See MoSCoW in `07-implementation-plan.md` section 8. In short: sandbox connection, webhook + polling sync, case collection, drafter + verifier, decision panel, approval, submit (live sandbox or dry-run), accept-claim, queue UI, seeded demo with replay mode. Should-haves: Prevent module, AG Studio dashboard, Case Copilot, PDF evidence packet.

### Out of scope (stated openly in README)
- Production PayPal. The code has no production URL.
- Multi-merchant onboarding and OAuth.
- Reasons other than item-not-received and refund-based (others get a manual packet).
- Any prediction of winning.
- Legal advice.

## 7. Constraints that shape the design

| Constraint | Consequence |
| --- | --- |
| Sandbox only, may not allow scripted dispute creation for an Indian developer account ❓ | UI route for creating disputes as a fallback; replay fixtures; spike S1 on Day 0 |
| Evidence types are only `PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, `OTHER` in our use ✅ | focus on INR and refund-proof; honest limits |
| Transaction Search lags up to 3 hours ✅ | Prevent says "data may be 3 hours old"; no real-time claims |
| Webhooks can be late, duplicated, out of order ✅ | idempotency, re-fetch before acting, polling backup |
| Judges may not run the code ✅ | strong README, hosted demo, replay mode, great video |
| AG Studio/AG Grid trial is 45 days ✅ | start the AG Studio trial on 1 Nov so it covers the 1–15 Dec judging window |
| Submission cannot be changed after the deadline ✅ | submit with buffer; verify links |

## 8. Success measures (for the build, not for marketing)

- A new user can reach "approved dry-run submission" for DS-001 in under 90 seconds (AC-DEMO-02).
- The verifier rejects 100% of the adversarial eval set (AC-VER-11).
- The demo video is under 3:00 and shows the full loop without cuts that hide failures.
- CI is green from a clean checkout with no credentials.

## 9. Demo data (fictional shop "Hearthside Ceramics")

| ID | Reason | Situation | Lesson in the demo |
| --- | --- | --- | --- |
| DS-001 | Item not received | Tracking, delivery scan and matching address all present | Happy path: STRONG, draft with citations, approve, send |
| DS-002 | Item not received | No tracking anywhere, 5 h to deadline | WEAK, `NEEDS_INFO`, import CSV, becomes READY or recommends accept |
| DS-003 | Credit not processed | Refund exists | `PROOF_OF_REFUND` path |
| DS-004 | Unauthorised | Not supported | Honest limits: manual packet |
| RISK-001 | n/a | Unprotected payment + address mismatch | Prevent flags |
| RISK-002 | n/a | Paid 50 h ago, no tracking | `R-NOTRACK`, add tracking |

All names, addresses and numbers are synthetic.

## 10. Naming and branding

- Product name: Dispute Shield (working title; check for trademark conflicts before submission ❓).
- Do not use PayPal logos in a way that implies endorsement; the video must not include third-party trademarks beyond what the rules allow ✅ (rules say no third-party trademarks or copyrighted material without permission, so show the PayPal API by name in text but do not use the logo, and keep screen captures of PayPal's own UI minimal or avoid them).
- Licence: MIT or Apache-2.0, file at repo root and detectable in the GitHub About section ✅.

## 11. Open product questions

1. Does the owner want evidence in a PDF packet to attach (Should) or is the note text enough for the MVP?
2. Will a second persona (a freelancer taking PayPal invoices) strengthen Potential Impact, or dilute focus? Default: no, stay with small online shops.
3. Is a hosted live-sandbox demo worth the reliability risk, or is replay mode the hosted default? Default: hosted = replay with a clearly visible label; live is demonstrated in the video and runnable locally.
