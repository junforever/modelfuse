# Animated Response Status

## Goal
Animate the loading-state text gradient from left to right for both pending and generating responses, with accessible light/dark colors and reduced-motion support.

## Tasks
- [x] T1 — Update the focused ResponsePanel test to require the shimmer animation contract and observe RED.
  - Evidence: focused Vitest exit 1; missing `motion-safe:animate-response-shimmer` at `ResponsePanel.test.tsx:148`.
- [x] T2 — Add the minimal Tailwind v4 animation token and apply it to the shared response status.
  - Evidence: `response-shimmer` moves background position from `100% 50%` to `0% 50%` over 1.8s; the shared status uses a 200%-wide theme-aware gradient behind `motion-safe:`.
- [x] T3 — Observe GREEN and run focused typecheck, lint, diff, and native review checks.
  - Evidence: focused Vitest 7/7, strict frontend typecheck, focused lint, production build, compiled animation/reduced-motion CSS checks, `git diff --check`, and native reliability review all passed.

## Evidence
- Branch: `fix/animated-response-status`
- Commits: none (the user did not request commits)
