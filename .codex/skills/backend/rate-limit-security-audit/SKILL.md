---
name: rate-limit-security-audit
description: Specialized audit skill for dynamic rate limiting, CORS policies, security headers, request parsing constraints, and environment validation in Express + TypeScript backends.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, express-rate-limit 7+, helmet 7+, cors 2.8+, Zod 3.x.
metadata:
  author: junforever
  version: '1.0'
  category: security-middleware
---

# Rate Limiting & Security Middleware Audit Skill for Backend

Apply this skill ONLY when reviewing code involving request throttling, cross-origin policies, security header configuration, payload parsing constraints, or environment validation. For standard route implementation or basic error handling, use the core auditor rules instead.

## 🎯 When to Activate

Activate this skill when the audited code involves:

- Rate limiting or request throttling middleware configuration.
- CORS origin allowlists, credential policies, or preflight handling.
- Security header injection via Helmet or custom middleware chains.
- Request body size limits, JSON parsing depth, or URL parameter constraints.
- Trust proxy configuration, forwarded header extraction, or IP-based routing decisions.
- Environment variable validation at startup or server initialization guards.

🔐 Environment Variable & Startup Validation Audit

- Verify that critical environment variables are validated synchronously at startup using a strict schema (e.g., Zod) before any server initialization.
- Flag as a **high-severity** finding if the application can boot without critical configurations (e.g., `PORT`, `DATABASE_URL`, `JWT_SECRET`), risking mid-request crashes.
- Verify that the `app.listen()` call (or server startup) is strictly guarded by `if (process.env.NODE_ENV !== 'test')` to prevent port conflicts or side effects during test execution. Flag missing guards as **medium-severity**.

## ⚡ Rate Limiting & Throttling Audit

- **Audit Dynamic Identification Rule**: Verify that the rate limiter's `keyGenerator` is explicitly configured to be identity-aware on all protected routes. Flag as a **high-severity** finding if the code maps constraints exclusively to the client IP (`req.ip`) when a verified user context (`req.user?.id`) is available.
- Verify external/distributed store usage (e.g., Redis via `rate-limit-redis`) for rate limit counters in multi-instance or production deployments. Flag in-memory stores in production as **medium-severity**.
- Check for consistent `Retry-After` header emission, standardized `429 Too Many Requests` responses, and cache-control directives on throttled endpoints.
- Flag sensitive endpoints (auth, password reset, payment, file upload) that fail to enforce stricter rate limits than general read-only endpoints.

## 🔒 Security Headers & Middleware Stack Audit

- Verify explicit security header configuration via Helmet; flag missing or disabled defaults for production environments.
- Audit middleware execution order to ensure security and body parsing layers execute at the very top of the stack, completely before routing, authentication, or core business logic.
- Check for explicit suppression of framework versions and environment identifiers (e.g., verify `app.disable('x-powered-by')` or Helmet equivalents are active).
- Flag manual header injection that conflicts with, overrides, or weakens established security middleware defaults.

## 🌐 CORS & Cross-Origin Policies Audit

- Verify explicit origin allowlists; flag wildcard (`*`) origins or permissive/unbound regex patterns in production configurations as **high-severity**.
- Audit exposed and allowed methods/headers against minimum required client functionality; flag overly broad permissions.
- Check preflight cache durations (`maxAge`) and credential handling alignment with authentication/cookie strategies.
- Flag dynamic origin validation without strict sanitization, host header injection prevention, or regex backtracking safeguards (ReDoS).
- Verify `Access-Control-Allow-Credentials: true` usage matches cookie `sameSite` and `secure` attribute configurations.

## 📏 Request Parsing & Payload Constraints Audit

- Verify explicit maximum body size limits (e.g., `express.json({ limit: '10kb' })`) for JSON, URL-encoded, and multipart requests aligned with endpoint expectations to prevent buffer memory exhaustion.
- Audit JSON parser configuration for depth limits, prototype pollution prevention, and safe key iteration constraints.
- Check for early `Content-Type` validation and rejection of malformed, unsupported, or mismatched media types.
- Verify parsing failures are caught, mapped to appropriate HTTP status codes (400 or 413), and do not expose internal parser stack traces.

## 🌍 Trust Proxy & Network Identification Audit

- Verify `trust proxy` configuration accurately reflects reverse proxy count or load balancer topology (e.g., `app.set('trust proxy', number)`). Flag as a **critical** finding if `trust proxy` is completely disabled or unconfigured while relying on forwarded headers.
- Audit client IP extraction logic; flag reliance on `X-Forwarded-For` or similar headers without verified proxy trust chains to mitigate header spoofing injections.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for middleware defaults, security posture updates, or version-breaking configuration changes before flagging findings.
- Mention briefly in the audit report which documentation was checked and how it influenced severity classification.
- Known Library IDs:
  - express-rate-limit: /express-rate-limit/express-rate-limit
  - helmet: /helmetjs/helmet
  - cors: /expressjs/cors
  - Redis: /redis/node-redis
  - Node.js HTTP/Proxy: /nodejs/node

## 🚫 Anti-Patterns to Flag

- Starting the application without validating critical environment variables (fail-fast).
- Wildcard CORS origins or unbounded method/header allowances in production.
- In-memory rate limit stores for distributed, clustered, or horizontally scaled deployments.
- Trusting client-provided IP or forwarding headers without explicit proxy verification and `trust proxy` settings.
- Unbounded JSON parsing depth, prototype pollution vectors, or missing body size constraints.
- Misordered middleware stack where security/parsing executes after business logic, authentication, or routing layers.
- Returning verbose security error details, rate limit internals, or header configurations to API clients.

## 📝 Output Integration

- Map all findings to the core auditor JSON schema using fields like `category: "security"`, `category: "config-integrity"`, `category: "express-lifecycle"`, or `category: "validation"` as appropriate.
- Assign severity logically: `critical` for IP/header spoofing vectors or unbounded parser depth; `high` for wildcard CORS in production, missing fail-fast env validation, or missing client-payload size limits; `medium` for misordered middleware stacks, missing user-aware rate tiers, or missing `NODE_ENV` guard on `app.listen()`; `low` for minor redundant header configurations.
- Merge findings cleanly into the single JSON report block required by `backend-auditor`. Never generate code snippets.
