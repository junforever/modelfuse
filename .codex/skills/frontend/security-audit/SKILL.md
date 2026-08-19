---
name: security-audit
description: Audits frontend code for security vulnerabilities, data exposure, unsafe DOM manipulation, credential leaks, and information disclosure. Use when handling user input, external data, auth flows, or dynamic content.
compatibility: React 18+, TypeScript 5+, Vite 5+, TailwindCSS 4+. Applies to all client-side security contexts.
metadata:
  author: junforever
  version: '2.0'
  category: security
---

# Security Audit Skill for React + TypeScript

Apply this skill ONLY when the codebase handles untrusted input, dynamic content, credentials, external integrations, or complex data flows. For static UI or non-interactive components, rely on the auditor core rules.

## 🎯 When to Activate

Activate this skill when the task or code involves:

- Rendering user-generated or external API data.
- Implementing authentication, token management, or session handling.
- Using `dangerouslySetInnerHTML`, dynamic imports, or runtime script injection.
- Parsing, redirecting, or navigating based on untrusted URLs or query parameters.
- Storing or transmitting sensitive configuration, keys, or PII.
- Integrating third-party SDKs, payment widgets, or external analytics.

## 🛡️ Data Validation & DOM Safety

- **CRITICAL**: Flag missing runtime validation (e.g., Zod schema validation) of external API data before assigning it to state or rendering it in the DOM. Treat all external data as untrusted, regardless of HTTP 200 status.
- Flag any direct insertion of untrusted data into DOM nodes, HTML attributes, or inline styles without explicit sanitization.
- Verify that `dangerouslySetInnerHTML` is either absent or strictly paired with a proven, audited sanitization utility.
- Ensure dynamic `src`, `href`, `style`, or event handler attributes are validated or constructed exclusively from trusted sources.
- Check that user-generated content is never rendered as executable markup, injected into event attributes, or evaluated at runtime.
- Verify that TypeScript types do not mask unsafe deserialization; confirm runtime validation exists before DOM insertion.

## 🔑 Secrets, Credentials & Storage

- Flag hardcoded API keys, tokens, passwords, service accounts, or private configuration in client-side code.
- Verify that sensitive data is never stored in `localStorage`, `sessionStorage`, or unflagged cookies without explicit security justification.
- Ensure environment variables follow build-tool conventions (e.g., `VITE_` prefix) and are not accidentally bundled or exposed in production.
- Check that authentication tokens are handled via secure patterns (e.g., HTTP-only cookies, in-memory references) rather than plaintext, URL fragments, or global variables.
- Audit for accidental leakage of internal endpoints, debug payloads, or staging URLs in client bundles.

## 🔗 Network, Links & External Resources

- Verify that all external links using `target="_blank"` include `rel="noopener noreferrer"` to prevent tabnabbing and reverse tab access.
- Flag unvalidated redirects, dynamic `window.location` assignments, or `history.push` with user-controlled paths that could enable open redirect vulnerabilities.
- Ensure API calls and asset loads use secure protocols and do not trigger mixed-content warnings.
- Check that CORS headers are never treated as a client-side security boundary; validate data and behavior independently of server policies.
- Audit third-party script tags or dynamic SDK loads for integrity attributes (`integrity`, `crossorigin`) and trusted origin verification.

## 🚫 Error Handling & Information Disclosure

- Ensure error messages displayed to users are generic and do not expose stack traces, internal endpoints, database schemas, or sensitive configuration.
- Verify that `console.error`, telemetry payloads, or logging utilities do not leak credentials, tokens, or personally identifiable information (PII) in production.
- Check that failed network requests do not inadvertently return raw backend responses, debug objects, or verbose error details to the UI.
- Flag silent failures that mask security issues; ensure explicit error states are logged securely without user exposure.

## ⚛️ React & Framework-Specific Risks

- Flag usage of `eval()`, `new Function()`, or dynamic `import()` with untrusted or user-controlled strings.
- Verify that component props accepting callbacks, HTML strings, URLs, or configuration objects are strictly typed and defensively handled.
- Ensure that third-party UI libraries or widgets are imported statically from trusted sources and not injected dynamically without integrity checks.
- Check that state management patterns do not inadvertently persist sensitive transient data across route changes or component lifecycles.

## 📉 Anti-Patterns to Flag

| Pattern                                                        | Severity | Why It Matters                                  |
| -------------------------------------------------------------- | -------- | ----------------------------------------------- |
| Direct `innerHTML` or unsanitized template literals in JSX     | Critical | Enables XSS and DOM injection                   |
| Hardcoded secrets, tokens, or internal URLs in client code     | Critical | Exposes credentials to reverse engineering      |
| Missing `rel="noopener noreferrer"` on `target="_blank"` links | High     | Enables tabnabbing and origin access            |
| Raw error objects or stack traces in user-facing UI            | High     | Leaks architecture, paths, and debug data       |
| Sensitive data in URL query params or hash fragments           | Medium   | Visible in browser history, referrers, and logs |
| Assuming CORS or client validation replaces server security    | High     | Creates false security boundaries               |

## 📝 Output Expectations

- Align all findings strictly with the auditor core JSON schema. Do not generate, suggest, or modify code.
- Classify severity accurately:
  - `critical`: Direct exploit vector, credential exposure, or XSS/DOM injection risk.
  - `high`: Missing validation, unsafe pattern, or information disclosure with realistic impact.
  - `medium`: Defensive gap, risky assumption, or non-critical storage/network flaw.
  - `low`: Best practice deviation or minor hardening opportunity.
- Provide exact line references, violated security rule, and actionable, framework-agnostic remediation guidance.
- Verify findings against production build behavior, not just dev environment assumptions.
- Mention briefly when Context7 was consulted for sanitization libraries, Vite env security, or dependency safety checks.
