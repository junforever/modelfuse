---
name: crypto-auth-audit
description: Specialized audit skill for cryptographic operations, authentication flows, session management, and token lifecycle in Express + TypeScript backends.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, bcrypt, jsonwebtoken, express-session, OAuth2/OIDC providers.
metadata:
  author: junforever
  version: '1.0'
  category: security-crypto-auth
---

# Crypto & Auth Audit Skill for Backend

Apply this skill ONLY when reviewing code involving cryptographic operations, authentication mechanisms, session handling, or token lifecycle management. For general endpoint security or basic input validation, use the core auditor rules instead.

## 🎯 When to Activate

Activate this skill when the audited code involves:

- JWT issuance, signing, verification, or refresh token flows.
- Password hashing, verification, or rotation policies.
- Server-side session storage, cookie configuration, or session fixation handling.
- OAuth2/OIDC integration, state validation, PKCE, or token exchange.
- Authentication middleware, identity extraction, or role/permission assignment.
- CSRF token generation, validation, or double-submit patterns.
- Cryptographic key management, signing algorithm selection, or secret rotation.

## 🔍 Cryptographic Configuration Audit

- Verify adaptive hashing algorithms are used for credentials with explicitly configured, secure work factors.
- Flag usage of deprecated, weak, or synchronous cryptographic functions inside async request handlers.
- Ensure signing keys, secrets, and salt values meet minimum entropy requirements and are loaded exclusively from validated environment variables.
- Detect hardcoded secrets, inline keys, or fallback to default/weak signing algorithms in token libraries.
- Validate that algorithm allowlists are explicitly enforced during verification; flag implicit or unrestricted algorithm acceptance.

## 🔑 Token Lifecycle & Validation Audit

- Audit token expiration policies for reasonable lifespans; flag excessively long or missing `exp` claims on access tokens.
- Verify refresh token rotation, revocation mechanisms, and secure storage; flag stateless tokens treated as inherently revocable.
- Check for strict claim validation (issuer, audience, subject, not-before) before trusting token payloads for downstream logic.
- Identify token reuse vulnerabilities, missing invalidation on logout/password change, or improper error handling on expired/invalid tokens.
- Ensure token verification errors do not leak implementation details, partial token data, or cryptographic internals to clients.

## 🍪 Session & Cookie Security Audit

- Verify session cookies enforce `httpOnly`, `secure`, and appropriately scoped `sameSite` attributes in production configurations.
- Audit session ID regeneration upon authentication state changes to prevent fixation attacks.
- Check for explicit session timeout, idle expiration, and secure cleanup on logout or privilege escalation.
- Flag in-memory session stores in distributed or production deployments without documented justification.
- Ensure session storage does not contain plaintext credentials, raw tokens, or unencrypted sensitive payloads.

## 🛡️ Authentication Flow & Middleware Audit

- Verify strict separation between authentication (identity verification) and authorization (permission evaluation) middleware layers.
- Audit credential verification flows for constant-time comparison and timing-attack resistance.
- Check OAuth2/OIDC state parameter validation, PKCE enforcement, and secure redirect URI matching against allowlists.
- Ensure authentication middleware attaches verified identity to the request context safely without type widening or unsafe assertions.
- Flag missing or inconsistent HTTP status codes for authentication and authorization failures (`401` vs `403` vs `400`).

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for library-specific cryptographic defaults, token verification behaviors, or security posture updates before flagging findings.
- Mention briefly in the audit report which documentation was checked and how it influenced severity classification.
- Known Library IDs:
  - jsonwebtoken: /auth0/node-jsonwebtoken
  - bcrypt: /kelektiv/node.bcrypt.js
  - express-session: /expressjs/session
  - OAuth2/OIDC: /openid/oauth-2.0-specification
  - passport: /jaredhanson/passport
  - Node.js Crypto: /nodejs/node

## 🚫 Anti-Patterns to Flag

- Using `none` or implicit algorithms in JWT verification options.
- Storing plaintext credentials, reversible hashes, or weak salt configurations.
- Relying on client-side token validation or trusting unverified token claims for business logic.
- Missing session regeneration, indefinite cookie lifetimes, or insecure `sameSite` configurations in production.
- Mixing synchronous cryptographic calls inside async request handlers or event loop paths.
- Returning detailed authentication failure reasons that enable user enumeration or credential stuffing analysis.
- Implementing custom cryptographic primitives or rolling custom hashing/encryption algorithms.

## 📝 Output Integration

- Map all findings to the core auditor JSON schema using `category: "security"` or `category: "express-lifecycle"`.
- Assign severity based on exploitability: `critical` for bypass/data leak vectors, `high` for missing validation/rotation, `medium` for configuration gaps, `low` for consistency/type gaps.
- Provide precise line ranges, violated cryptographic/auth rules, evidence context, and directional recommendations. Never generate code.
- Merge findings into the single JSON report block required by `backend-auditor`. Defer all implementation, refactoring, and test writing to the backend-builder and testing agents.
