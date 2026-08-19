---
name: authentication
description: Implements secure authentication flows for Express + TypeScript backends. Use when handling JWT, sessions, OAuth, password hashing, role-based access, or token lifecycle management.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, bcrypt 5+, jsonwebtoken 9+. Compatible with session stores (Redis, connect-redis), OAuth2 providers, or custom identity strategies.
metadata:
  author: junforever
  version: '1.0'
  category: security-auth
---

# Authentication Skill for Express + TypeScript

Apply this skill ONLY when the task involves implementing, refactoring, or securing authentication flows, credential handling, or access control mechanisms. For basic route protection or simple API key validation, use the core agent rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Implementing login, registration, or credential verification flows.
- Handling JWT issuance, validation, rotation, or revocation.
- Configuring secure session management with server-side stores.
- Integrating OAuth2/OIDC providers or social login strategies.
- Implementing password hashing, verification, or rotation policies.
- Designing role-based or attribute-based access control (RBAC/ABAC).
- Handling token refresh, silent re-authentication, or session fixation prevention.

## 🔐 Cryptography & Credential Handling

- Hash passwords using adaptive, computationally expensive algorithms with configurable work factors before storage.
- Never store plaintext passwords, reversible encryption of credentials, or deprecated hashing mechanisms.
- Generate cryptographic secrets and signing keys using secure random generators; enforce minimum key length and rotation policies.
- Validate credential inputs strictly before hashing or comparison to prevent timing attacks or algorithm downgrade attempts.
- Use constant-time comparison functions for verifying tokens, passwords, or secure strings.
- Never log, serialize, or expose credentials, hashes, or signing keys in responses, logs, or error payloads.

## 🛡️ Session & Cookie Management

- Configure session cookies with strict security attributes: `httpOnly`, `secure` in production, `sameSite` scoped appropriately, and explicit domain/path boundaries.
- Implement session fixation protection by regenerating session identifiers upon authentication state changes.
- Define explicit session expiration, idle timeout, and absolute lifetime policies aligned with security requirements.
- Use secure, scalable session stores for distributed deployments; avoid in-memory stores in production environments.
- Handle session invalidation explicitly on logout, password change, or privilege escalation events.
- Clear session storage and cookies completely during sign-out; avoid leaving orphaned or dangling session tokens.

## 🔑 Token Lifecycle & JWT Management

- Sign tokens with explicit, cryptographically strong algorithms and enforce strict algorithm allowlists during verification.
- Define explicit token lifespans: short-lived access tokens paired with longer-lived, securely stored refresh tokens.
- Implement token revocation strategies through allowlists, blocklists, or versioned token identifiers; never assume stateless tokens are inherently revocable.
- Validate all token claims rigorously: issuer, audience, expiration, not-before, and subject identity before trusting payload data.
- Handle token refresh flows atomically: validate refresh token, issue new token pair, rotate refresh token, and invalidate old ones.
- Store refresh tokens securely server-side or in encrypted, httpOnly cookies; never expose them in URLs or client-accessible storage.

## 🧩 Middleware & Route Protection

- Implement authentication middleware that extracts, validates, and attaches verified identity to the request object before route execution.
- Separate authentication (identity verification) from authorization (permission evaluation) into distinct, composable middleware layers.
- Handle missing, malformed, or expired tokens gracefully; return standardized unauthenticated responses without leaking implementation details.
- Ensure middleware execution order places auth checks after parsing/security middleware but before business logic handlers.
- Avoid blocking synchronous operations in auth middleware; handle async verification with proper error propagation.
- Design middleware to be stateless and reusable across route groups, supporting token strategies when applicable.

## 📦 TypeScript Typing & Identity Context

- Define explicit, strongly-typed identity payloads that attach to the request object after successful authentication.
- Extend the Express request interface safely using global namespace merging (e.g., `declare global { namespace Express { interface Request { user: UserPayload } } }`), avoiding unsafe type assertions or `any`.
- Model authentication states clearly using discriminated unions for pending, authenticated, unauthenticated, and error conditions.
- Define strict type contracts for credential inputs, token payloads, and authentication responses.
- Ensure type safety propagates through middleware, services, and route handlers without requiring repeated validation or type narrowing.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for library-specific APIs, cryptographic defaults, or security recommendations before implementing authentication logic.
- Mention briefly in the output which documentation was consulted and how it influenced configuration choices or security decisions.
- Known Library IDs:
  - jsonwebtoken: /auth0/node-jsonwebtoken
  - bcrypt: /kelektiv/node.bcrypt.js
  - express-session: /expressjs/session
  - OAuth2/OIDC: /openid/oauth-2.0-specification
  - passport: /jaredhanson/passport
  - Node.js Crypto: /nodejs/node

## 🚫 Anti-Patterns to Avoid

- Using symmetric signing keys with insufficient entropy or hardcoded secrets.
- Relying on implicit algorithm acceptance or allowing `none` in verification options.
- Storing refresh tokens in localStorage, URLs, or client-accessible cookies.
- Implementing custom cryptographic primitives or rolling your own hashing algorithms.
- Trusting identity claims, roles, or permissions extracted directly from request bodies or query parameters.
- Failing to rotate sessions or tokens upon privilege changes, password resets, or logout events.
- Returning detailed authentication failure reasons that enable user enumeration or credential guessing.
- Mixing authentication state with application business state in shared storage.

## 📝 Output Expectations

- Provide cryptographic configuration and credential handling logic first, followed by token/session management, then middleware implementation.
- Include explicit TypeScript type definitions for identity context, token payloads, authentication states, and response contracts.
- Document security decisions including algorithm selection, token lifespan rationale, session configuration, and revocation strategy.
- Ensure TypeScript compilation passes, linting rules are respected, and cryptographic operations use proven, audited libraries.
- Mention briefly when Context7 was consulted for library APIs and how it shaped the implementation or configuration choices.
- Defer comprehensive security auditing, penetration testing simulations, and compliance validation to the dedicated backend-auditor agent.
