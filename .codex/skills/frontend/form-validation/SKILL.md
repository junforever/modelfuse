---
name: form-validation
description: Implements robust, accessible form validation and submission patterns in React. Use when tasks involve multi-field forms, dynamic validation, schema integration, or complex submission workflows.
compatibility: React 18+, TypeScript 5+, Vite 8+, TailwindCSS 4+, React Hook Form, Zod. Compatible with native validation patterns.
metadata:
  author: junforever
  version: '1.0'
  category: form-patterns
---

# Form Validation Skill for React + TypeScript

Apply this skill ONLY when form complexity exceeds simple controlled inputs or basic HTML validation. For single-field inputs with minimal rules, use the core agent rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Multi-field forms with cross-field or conditional validation.
- Schema-based validation using Zod or strict type inference.
- Dynamic field generation, add/remove arrays, or nested structures.
- Complex submission flows with explicit loading, success, and error states.
- Async validation (e.g., availability checks, external API lookups).
- File uploads, rich text editors, or custom interactive inputs.

## 📐 Validation Architecture & State Management

- Centralize validation logic in a single source of truth (schema or dedicated hook).
- Derive error states from validation results; avoid parallel boolean flags per field.
- Keep form state localized to the component or feature module; avoid unnecessary global state.
- Use controlled inputs for complex validation and UI sync; prefer uncontrolled only for performance-heavy or simple static forms.
- Sync validation triggers with user intent: validate on blur, change, or submit based on UX requirements.
- Clear or preserve form state intentionally after submission success or failure.

## 🛡️ Schema & Type Safety

- Define validation schemas explicitly and infer TypeScript types from them to avoid duplication.
- Deserialize and validate form input values before processing or submission.
- Handle async validation with debounce, cancellation on value change, and clear loading indicators.
- Map schema validation errors to field-level messages; keep internal validation details for logging.
- Never treat client-side validation as a security boundary; always assume server-side validation will run.
- Consult Context7 for library-specific type inference, schema composition, and version-specific APIs.

## ♿ Accessibility & UX for Forms

- Explicitly associate labels with inputs using `htmlFor` and matching `id`.
- Connect error messages to inputs via `aria-describedby` and toggle `aria-invalid="true"` on invalid state.
- Use `aria-live="polite"` for dynamic validation feedback to announce changes to screen readers.
- Preserve focus on the first invalid field after submission failure.
- Maintain visible focus indicators and ensure full keyboard navigation through fields, errors, and submit actions.
- Prevent layout shifts when validation messages appear; reserve space or use fixed-height containers.
- Provide clear, actionable error messages that explain the issue and how to resolve it.

## 🔄 Submission & Error Handling

- Model submission state explicitly using a discriminated union: `{ status: 'idle' | 'submitting' | 'success' | 'error', error: string | null, data: T | null }`.
- Prevent double or concurrent submissions during async operations.
- Handle network errors, client validation errors, and server-side validation mismatches as distinct flows.
- Show user-friendly feedback for all outcomes; never leave the form in a silent or ambiguous state.
- Preserve user input on error; only reset on explicit success or user action.
- Provide retry or edit capabilities when submission fails due to transient network issues.

## 📦 Architecture & Component Pattern

- Extract form orchestration logic to a custom hook or library controller; keep UI components presentational.
- Pass validation state, change handlers, and submission triggers via props or context.
- Group related fields into logical sections or `fieldset` elements with `legend` for accessibility.
- Keep form files focused; extract complex validation schemas, async logic, or field configurations to separate modules.
- Use Tailwind consistently for validation states (e.g., border colors, helper text visibility, focus rings).
- Document form behavior, validation triggers, and submission flow in JSDoc or inline comments.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for React Hook Form and Zod API specifications.
- Known Library IDs:
  - React Hook Form: /react-hook-form/react-hook-form
  - Zod: /colinhacks/zod

## 🚫 Anti-Patterns to Avoid

- Scattering inline validation logic across multiple components or render functions.
- Using `any` for form values, errors, or submission payloads.
- Trusting client validation as a substitute for server-side security checks.
- Blocking UI completely during submission without progress indication or cancel capability.
- Clearing form data on error instead of preserving user input for correction.
- Over-engineering simple forms with heavy libraries or complex state machines without justification.
- Missing `aria-invalid`, `aria-describedby`, or explicit label associations.
- Using uncontrolled inputs for highly dynamic or conditionally validated forms without clear performance rationale.

## 📝 Output Expectations

- Provide validation schema/type definitions first, then the form controller or hook, then the UI component.
- Include explicit TypeScript types inferred from or strictly aligned with the validation schema.
- Document validation triggers, submission state machine, and error handling strategy.
- Verify accessibility attributes, keyboard navigation, focus management, and clean TypeScript compilation.
- Mention briefly when Context7 was consulted for library-specific APIs and how it shaped the implementation.
