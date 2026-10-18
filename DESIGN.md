# HACKER HOUSE GOA 2026

## Mission

Create implementation-ready, token-driven UI guidance for HACKER HOUSE GOA 2026 that is optimized for consistency, accessibility, and fast delivery across dashboard web app.

## Brand

- Product/brand: HACKER HOUSE GOA 2026
- URL: https://hacker-house-goa-2026.devfolio.co/dashboard
- Audience: authenticated users and operators
- Product surface: dashboard web app

## Style Foundations

- Visual style: clean, functional, implementation-oriented
- Main font style: `font.family.primary=Nunito Sans`, `font.family.stack=Nunito Sans, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=18.4px`
- Typography scale: `font.size.xs=12px`, `font.size.sm=14px`, `font.size.md=16px`, `font.size.lg=18px`, `font.size.xl=20px`, `font.size.2xl=24px`, `font.size.3xl=36px`
- Color palette: `color.surface.base=#000000`, `color.text.secondary=#535f66`, `color.text.tertiary=#90999e`, `color.text.inverse=#2b363c`, `color.surface.muted=#ffffff`, `color.surface.raised=#f0f4ff`, `color.surface.strong=#f5f7f7`
- Spacing scale: `space.1=4px`, `space.2=8px`, `space.3=10px`, `space.4=12px`, `space.5=13.5px`, `space.6=16px`, `space.7=23px`, `space.8=24px`
- Radius/shadow/motion tokens: `radius.xs=4px`, `radius.sm=8px`, `radius.md=12px`, `radius.lg=24px`, `radius.xl=40px`, `radius.2xl=50px` | `shadow.1=rgba(3, 0, 92, 0.05) 0px 1px 4px 0px`, `shadow.2=rgba(3, 0, 92, 0.12) 0px 1px 3px 0px, rgba(3, 0, 92, 0.07) 0px 4px 11px 0px` | `motion.duration.instant=100ms`, `motion.duration.fast=150ms`, `motion.duration.normal=300ms`

## Accessibility

- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone

Concise, confident, implementation-focused.

## Rules: Do

- Use semantic tokens, not raw hex values, in component guidance.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't

- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.

## Guideline Authoring Workflow

1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure

- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations

- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Include known page component density: buttons (36), links (23), lists (9), navigation (4), inputs (2).

- Extraction diagnostics: Audience and product surface inference confidence is low; verify generated brand context.

## Quality Gates

- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.
