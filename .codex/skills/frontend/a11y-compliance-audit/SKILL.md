---
name: a11y-compliance-audit
description: Audits frontend code for accessibility compliance, WCAG 2.2 AA adherence, ARIA correctness, keyboard navigation, focus management, and screen reader compatibility. Use for interactive components, complex UI, or explicit accessibility requirements.
compatibility: React 18+, TypeScript 5+, Vite 8+, TailwindCSS 4+, WCAG 2.2 AA+.
metadata:
  author: junforever
  version: '2.0'
  category: accessibility
---

# Accessibility Compliance Audit Skill for React + TypeScript

Apply this skill ONLY when the codebase builds interactive components, uses custom ARIA, or requires formal accessibility compliance. For basic static layouts or simple presentational components, rely on the auditor core rules.

## 🎯 When to Activate

Activate this skill when the code or task involves:

- Modals, dialogs, dropdowns, tabs, accordions, data grids, or custom input widgets.
- Explicit WCAG 2.2 AA/AAA compliance requests or accessibility audit preparation.
- Custom keyboard navigation, focus trapping, or roving tabindex implementations.
- Dynamic status updates, error messages, or async notifications requiring screen reader announcements.
- Complex forms, multi-step wizards, or conditional UI flows.
- Use of `role`, `aria-*`, or visually hidden text beyond basic semantic HTML.

## 🏗️ Semantic HTML & Structure

- Verify correct use of semantic landmarks (`<header>`, `<main>`, `<nav>`, `<section>`, `<article>`, `<aside>`, `<footer>`).
- Flag misuse of generic containers (`<div>`, `<span>`) for interactive or structural purposes when native elements exist.
- Ensure heading hierarchy is logical, sequential, and not skipped for visual styling (`h1` through `h6`).
- Check that lists (`<ul>`, `<ol>`, `<dl>`) are used correctly and not simulated purely with CSS when semantic grouping is required.
- Verify that tabular data uses `<table>` with proper `<thead>`, `<tbody>`, `<th>`, and `scope` attributes.

## ♿ ARIA & Interactive Widgets

- Validate that `role` attributes accurately reflect widget behavior and are not applied solely for styling or layout.
- Check for correct pairing of `aria-label`, `aria-labelledby`, `aria-describedby`, and `aria-controls` with their intended targets.
- Ensure dynamic ARIA states (`aria-expanded`, `aria-hidden`, `aria-disabled`, `aria-checked`, `aria-invalid`) are explicitly synchronized with React state.
- Flag redundant, conflicting, or overridden ARIA attributes that break native element semantics.
- Verify that custom interactive widgets follow WAI-ARIA Authoring Practices for expected keyboard, state, and focus patterns.

## ⌨️ Focus & Keyboard Navigation

- Audit focus trapping for overlays, modals, and dialogs; ensure focus returns to the triggering element on close.
- Verify roving tabindex patterns for composite widgets (menus, toolbars, tabs, grids, radio groups).
- Check that all interactive elements are reachable and operable via keyboard (`Tab`, `Enter`, `Space`, `Arrow` keys, `Escape`).
- Flag elements using `tabindex` values other than `0` or `-1` unless explicitly justified for documented widget patterns.
- Ensure focus is managed correctly after dynamic DOM updates, route changes, async content loading, or error state changes.

## 👁️ Visual Accessibility & Motion

- Verify minimum color contrast ratios per WCAG 2.2 (4.5:1 for normal text, 3:1 for large text and UI components) across all visual states.
- Flag reliance on color alone to convey status, errors, warnings, or required actions; require supplementary indicators (icons, text, patterns).
- Check that focus indicators are visible, have sufficient contrast, and are never removed via `outline: none` or `:focus-visible` overrides without an equally clear alternative.
- Verify support for `prefers-reduced-motion` by checking for conditional or disabled non-essential animations, transitions, or auto-playing content.
- Ensure text remains readable and layout remains functional when zoomed up to 200% or when system text scaling is applied.

## 🗣️ Screen Reader & Dynamic Content

- Flag over-reliance on `data-testid` attributes to bypass proper semantic HTML or accessibility queries. Ensure interactive elements have proper roles, labels, and keyboard handlers natively.
- Audit use of `aria-live` regions for dynamic updates; verify `polite` vs `assertive` usage matches content urgency.
- Check that `aria-atomic` and `aria-busy` are used correctly to prevent overlapping, fragmented, or missing screen reader announcements.
- Ensure error messages, loading states, and success notifications are explicitly announced or programmatically linked to relevant inputs.
- Flag missing or incorrectly implemented visually hidden text (`sr-only`) required for icon-only buttons or abstract interactive elements.
- Verify that decorative images use `alt=""` and informative images use concise, context-aware `alt` text without duplicating surrounding visible labels.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for ARIA Practices Guide.
- Known Library IDs:
  - ARIA Practices Guide: /w3c/wai-aria-practices

## 📉 Anti-Patterns to Flag

| Pattern                                                                                        | Severity | Why It Matters                                                                  |
| ---------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `<div>`/`<span>` used as interactive controls without `role`, `tabindex`, or keyboard handlers | Critical | Breaks keyboard parity and screen reader recognition                            |
| Missing or incorrect heading hierarchy (skipped levels, multiple `h1`)                         | High     | Disrupts content navigation and document outline for assistive technology       |
| `aria-live` misconfigured, missing, or overused for dynamic status/errors                      | High     | Leaves screen reader users unaware of state changes or causes announcement spam |
| Focus not trapped or returned in modals/dialogs/overlays                                       | High     | Causes keyboard users to lose context or navigate behind overlays               |
| Low contrast ratios below WCAG 2.2 thresholds for text or UI components                        | High     | Reduces readability for users with visual impairments or in bright environments |
| `outline: none` or `:focus-visible` removed without accessible alternative                     | Medium   | Eliminates critical keyboard navigation feedback                                |
| Color-only status indicators for errors, success, or warnings                                  | Medium   | Fails for colorblind users and high-contrast/forced-colors modes                |
| Redundant or conflicting ARIA overriding native element semantics                              | Low      | Creates confusion for assistive technology and automated linters                |

## 📝 Output Expectations

- Align all findings strictly with the auditor core JSON schema. Do not generate, suggest, or modify code.
- Classify severity accurately:
  - `critical`: Blocks keyboard/screen reader usage or violates fundamental semantic rules.
  - `high`: Significant navigation, announcement, or contrast gap that impacts WCAG 2.2 AA compliance.
  - `medium`: Defensive a11y gap, focus management flaw, or visual indicator risk with measurable impact.
  - `low`: Best practice deviation, minor ARIA redundancy, or non-critical styling/accessibility preference.
- Provide exact line references, violated accessibility rule, and actionable, standard-compliant remediation guidance.
- Verify findings against WCAG 2.2 AA success criteria and WAI-ARIA Authoring Practices.
- Mention briefly when Context7 was consulted for a11y library APIs, ARIA patterns, or testing utilities.
