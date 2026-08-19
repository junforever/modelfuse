---
name: advanced-a11y
description: Implements advanced accessibility patterns for complex interactive UI components. Use when building modals, dialogs, dropdowns, tabs, data grids, or when explicit WCAG compliance, focus management, and screen reader optimization are required.
compatibility: React 18+, TypeScript 5+, Vite 8+, TailwindCSS 4+, WCAG 2.2 AA+. Compatible with Radix UI, Headless UI, React Aria, or native implementations.
metadata:
  author: junforever
  version: '1.0'
  category: accessibility
---

# Advanced Accessibility Skill for React + TypeScript

Apply this skill ONLY when component complexity exceeds basic semantic HTML and form validation. For standard layouts and simple interactive elements, use the core agent rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Building complex interactive widgets (modals, dialogs, dropdowns, comboboxes, tabs, accordions, data grids).
- Implementing explicit focus trapping, roving tabindex, or structured keyboard navigation.
- Requiring formal WCAG 2.2 AA/AAA compliance or accessibility audit readiness.
- Handling dynamic content updates that require screen reader announcements.
- Supporting reduced motion, high contrast, forced colors, or system theme preferences.
- Implementing drag-and-drop, resizable panels, or custom canvas/SVG interactions.

## ♿ Focus Management & Keyboard Navigation

- Implement explicit focus trapping for modal dialogs and overlays; always return focus to the triggering element on close.
- Use roving tabindex patterns for composite widgets (tabs, menus, toolbars, grids) to ensure single-tab navigation within the group.
- Support standard keyboard interactions: `Enter`/`Space` for activation, `Escape` for dismissal, `Arrow` keys for intra-widget navigation.
- Ensure all interactive elements are reachable via keyboard without requiring mouse events, hover states, or pointer-only gestures.
- Maintain logical tab order aligned with visual layout and DOM structure; restrict `tabindex` to `0` or `-1` unless explicitly justified.
- Restore or redirect focus after async content loads, route transitions, or dynamic DOM updates to prevent focus loss or orphaned cursors.

## 🗣️ Screen Reader Optimization & Live Regions

- Use `aria-live="polite"` or `aria-live="assertive"` for dynamic status updates, form errors, and async notifications.
- Announce critical state changes (modal open, tab switch, item added/removed) using live regions or `aria-atomic` appropriately to avoid speech overlap.
- Provide explicit accessible names for icon-only buttons, interactive containers, and complex widgets using `aria-label`, `aria-labelledby`, or visually hidden text.
- Ensure `role` attributes accurately reflect widget behavior; never apply roles solely for styling or layout purposes.
- Use `aria-expanded`, `aria-controls`, `aria-describedby`, and `aria-owns` to explicitly link UI controls with their associated content or targets.
- Validate logical reading order for screen readers; avoid relying on CSS positioning or visual hierarchy alone for semantic structure.

## 🎨 Visual Preferences & Motion

- Respect `prefers-reduced-motion` by disabling or simplifying non-essential animations, transitions, and auto-playing content.
- Provide a mechanism to pause, stop, or hide moving, blinking, or scrolling content that lasts longer than 5 seconds or auto-plays.
- Ensure minimum color contrast ratios per WCAG 2.2 (4.5:1 for normal text, 3:1 for large text and UI components) across all states.
- Never rely on color alone to convey state, meaning, or required actions; supplement with icons, text labels, or patterns.
- Support `prefers-color-scheme` and `forced-colors` media queries for high-contrast mode and system theme compatibility.
- Maintain visible focus indicators at all times; never remove `outline` or `:focus-visible` without providing an equally clear alternative.

## 📦 Architecture & Component Patterns

- Prefer battle-tested, accessible headless libraries (Radix UI) for complex widgets unless explicitly building from scratch.
- Isolate accessibility logic from presentational styling; expose a11y props explicitly and document expected keyboard behavior in component APIs.
- Use composition over monolithic components; break complex widgets into smaller, testable, and independently accessible sub-components.
- Keep ARIA attributes strictly synchronized with React state; avoid stale, mismatched, or dynamically generated `aria-*` values after re-renders.
- Document keyboard shortcuts, focus management strategy, and screen reader announcement behavior in JSDoc or component documentation.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for ARIA Practices Guide and Headless component API structures.
- Known Library IDs:
  - ARIA Practices Guide: /w3c/wai-aria-practices
  - Radix UI: /radix-ui/primitives

## 🚫 Anti-Patterns to Avoid

- Using `div` or `span` as interactive elements without proper `role`, `tabindex`, and keyboard event handlers.
- Removing `outline` or `:focus-visible` styles without implementing a clear, equally visible alternative focus indicator.
- Overusing `aria-live` regions causing excessive announcements, speech overlap, or screen reader fatigue.
- Hardcoding positive `tabindex` values (`tabindex="1"`, `tabindex="2"`) that break natural tab order and confuse keyboard users.
- Assuming mouse-only interactions or ignoring touch/keyboard parity in interactive components.
- Using ARIA roles as CSS hooks or misapplying `role="presentation"` to elements that convey structural or semantic meaning.
- Hiding critical interactive content with `display: none` or `aria-hidden="true"` without providing alternative navigation paths.
- Building custom focus traps without handling edge cases (iframe focus, nested modals, browser history navigation, shadow DOM boundaries).

## 📝 Output Expectations

- Provide the accessible component structure first, then focus/navigation logic, then styling integration.
- Include explicit TypeScript types for a11y props (`aria-*`, `role`, `data-*` attributes) and document expected keyboard interactions.
- Document focus management strategy, live region usage, and screen reader announcement behavior in comments or JSDoc.
- Verify WCAG 2.2 AA compliance, keyboard parity, visible focus states, reduced motion support, and clean TypeScript compilation.
- Mention briefly when Context7 was consulted for a11y library APIs or WCAG specification updates and how it shaped the implementation.
