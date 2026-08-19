---
name: rate-limit-security
description: Implements robust security middleware, dynamic rate limiting, CORS policies, payload restrictions, and environment validation for Express + TypeScript backends.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, express-rate-limit 7+, helmet 7+, cors 2.8+, Zod 3.x.
metadata:
  author: junforever
  version: '1.0'
  category: security-middleware
---

# Rate Limiting & Security Skill for Express + TypeScript

Apply this skill ONLY when the task involves configuring security middleware, request throttling, cross-origin policies, payload constraints, or environment validation. For standard route implementation without security constraints, use the core agent rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Validating critical environment variables at application startup (fail-fast pattern) to ensure the app never boots in an invalid state.
- Configuring rate limiting or request throttling per endpoint, dynamic identification, or IP.
- Setting up CORS policies for cross-origin requests, preflight handling, and credential sharing.
- Implementing security headers via Helmet or custom middleware chains.
- Enforcing request body size limits, JSON parsing constraints, or URL parameter restrictions.
- Configuring trust proxy settings for load balancers, reverse proxies, or CDN edge routing.
- Implementing IP allowlisting, blocklisting, or request fingerprinting strategies.

🔐 Environment Variable Validation (Fail-Fast)

- Use Zod to define a strict schema for critical environment variables (e.g., `PORT`, `DATABASE_URL`, `JWT_SECRET`) at application startup.
- Execute this validation synchronously before calling `app.listen()` or exporting the `createApp()` factory.
- If validation fails, log a clear, sanitized error message and terminate the process immediately (`process.exit(1)`). Never allow the server to start with missing or malformed critical configurations.

## 🛡️ Rate Limiting & Throttling

- Apply rate limiting globally by default, then relax or tighten per endpoint based on sensitivity and expected traffic patterns (e.g., stricter limits on `/api/auth/login`).
- **Mandatory Identification Strategy**: Configure the rate limiter's `keyGenerator` to be dynamically identity-aware. Prioritize the authenticated user identifier (e.g., `req.user?.id`) if available; fallback strictly to the client's validated IP address (`req.ip`) if unauthenticated.
- Store rate limit counters in external, distributed stores (e.g., Redis via `rate-limit-redis`) for multi-instance deployments. Avoid in-memory stores in production.
- Define explicit time windows (`windowMs`), maximum request counts (`max`), and return standard `Retry-After` headers.
- Handle rate limit exceeded responses consistently with a standardized `429 Too Many Requests` status code and a structured JSON error payload.

## 🔒 Security Headers & Middleware Configuration

- Configure security headers explicitly using proven middleware libraries (Helmet); avoid manual header injection unless strictly required.
- Enforce strict transport security (HSTS), content security policies (CSP), referrer policies, and frame options according to deployment architecture.
- Disable or strip response headers that leak server version or runtime environment details (e.g., `app.disable('x-powered-by')`).
- Position security middleware at the very top of the Express execution stack, before routing, parsing, authentication, and business logic.

## 🌐 CORS & Cross-Origin Policies

- Configure CORS with explicit origin allowlists; never use wildcard origins (`*`) in production unless explicitly required and formally documented.
- Restrict allowed HTTP methods, request headers, and exposed response headers to the minimum required for legitimate client functionality.
- Implement proper preflight request handling with appropriate cache durations (`maxAge`) and credential policies.
- Align CORS configuration with authentication strategies; ensure `credentials: true` settings match cookie `sameSite`, `secure`, and domain attributes.

## 📏 Request Parsing & Payload Constraints

- Enforce explicit maximum body sizes (e.g., `express.json({ limit: '10kb' })`) for JSON and URL-encoded requests to prevent memory exhaustion or denial-of-service vectors.
- Limit URL length, query string complexity, header counts, and parameter sizes to safe, predictable ranges.
- Validate `Content-Type` headers before parsing; reject mismatched, unsupported, or malformed media types early in the request pipeline.
- Ensure parsing failures are caught and mapped to appropriate HTTP status codes (e.g., 400 or 413) without exposing internal parser stack traces.

## 🌍 Trust Proxy & Network Identification

- Configure trust proxy settings accurately based on deployment architecture (e.g., `app.set('trust proxy', number_of_proxies)`) based on reverse proxy count or CDN edge routing topology.
- Extract client IP addresses from standardized forwarding headers (`X-Forwarded-For`) only after verifying proxy trust configuration to prevent header spoofing.
- Avoid relying on untrusted client headers for security decisions, throttling, or access filtering without explicit, validated proxy chains.

## 📦 TypeScript Typing & Configuration Contracts

- Define explicit, strongly-typed configuration interfaces for security middleware, rate limiters, CORS policies, and parsing constraints.
- Ensure type safety for rate limit custom responses, CORS header outputs, and security violation payloads across controllers and error handlers.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for library-specific APIs, security header defaults, or rate limiting store configurations before implementing.
- Mention briefly in the output which documentation was consulted and how it influenced configuration choices or security policies.
- Known Library IDs:
  - express-rate-limit: /express-rate-limit/express-rate-limit
  - helmet: /helmetjs/helmet
  - cors: /expressjs/cors
  - Redis: /redis/node-redis
  - Node.js HTTP: /nodejs/node

## 🚫 Anti-Patterns to Avoid

- Starting the application without validating critical environment variables (fail-fast).
- Using wildcard CORS origins or permissive header configurations in production without explicit justification.
- Relying on in-memory rate limit stores for distributed, clustered, or horizontally scaled deployments.
- Trusting client-provided IP or forwarding headers without configuring `trust proxy` and validating the proxy chain.
- Allowing unbounded JSON parsing depth, parameter counts, or request body sizes that risk event loop blocking or memory exhaustion.
- Returning verbose security error details, stack traces, or internal server configurations in rate limit or parser error payloads.
- Mixing security middleware with business logic or misordering the Express middleware stack.

## 📝 Output Expectations

- Provide the configuration in this logical order:
  1. Environment Validation (Zod).
  2. Global Security Middleware (Helmet, CORS, Body Parsers).
  3. Dynamic Rate Limiter Middleware.
  4. Global Error Handlers.
- Include explicit TypeScript type definitions for custom middleware options and error contracts.
- Document security decisions (e.g., trust proxy numbers, rate limit thresholds, allowlist validations, header configurations) within code comments.
- Ensure full compilation under TypeScript strict mode, applying zero-tolerance for type overrides or `any`.
