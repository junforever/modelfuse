---
name: cache-architect-audit
description: Specialized audit skill for caching strategies, TTL management, cache invalidation, memory constraints, and performance optimization in Express + TypeScript backends.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, ioredis 5+. Compatible with CDN edge caching and distributed Redis cluster layers.
metadata:
  author: junforever
  version: '1.0'
  category: performance-architecture
---

# Cache Architecture & Performance Audit Skill for Backend

Apply this skill ONLY when reviewing code involving external cache stores, response caching patterns, TTL strategies, cache invalidation, memory management, or stream/backpressure handling. For standard request handlers without caching layers, use the core auditor rules instead.

## 🎯 When to Activate

Activate this skill when the audited code involves:

- External cache client initialization, configuration, or connection pooling using `ioredis`.
- Cache-aside, write-through, read-through, or response caching implementations.
- TTL definition, expiration policies, cache versioning, or stale data reconciliation.
- Cache invalidation triggers on mutations, namespace/prefix scoping, or bulk eviction.
- Memory limit enforcement, payload serialization, or compression for cached objects.
- Cache stampede prevention, request coalescing, or background refresh patterns.
- Stream processing, backpressure handling, or large payload buffering constraints.

## ⚡ Caching Strategy & Configuration Audit

- Verify explicit cache pattern selection aligned with data volatility, access frequency, and consistency requirements.
- Audit cache key generation for determinism, scoping, and inclusion of relevant context (user ID, pagination, filters) to prevent collisions or stale reads across different client profiles.
- Check for explicit TTL values on all cached entries; flag indefinite or missing expiration policies unless justified by immutable/static data configurations.
- Verify environment and workload separation; flag shared cache namespaces or databases between development, staging, and production.
- Audit payload serialization strategy for large or complex objects; warn against unbounded binary storage in memory-backed caches.

## 🔄 Invalidation & Lifecycle Management Audit

- Verify explicit invalidation or version bumping on data mutations affecting cached resources (POST, PUT, DELETE).
- Check for namespace/prefix isolation to enable scoped or bulk invalidation without flushing unrelated cache entries (e.g., `user:123:profile`).
- Audit cache miss fallback behavior; ensure graceful degradation to authoritative data sources without cascading failures or duplicate concurrent fetches.
- Flag missing request coalescing or mutex patterns for high-traffic uncached resources susceptible to thundering herd effects (**Cache Stampedes**).
- Verify cache warming or background refresh strategies for frequently accessed data to prevent cold-start latency spikes.

## 📈 Memory & Performance Constraints Audit

- Verify explicit memory limits for in-memory caches, buffers, and request payloads to prevent heap exhaustion or GC spikes.
- Audit streaming implementations for proper backpressure handling (e.g., `stream.pipeline()`); flag synchronous buffering of entire large datasets before transmission.
- Check for CPU-intensive or blocking operations inside cache middleware or serialization pipelines that stall the Express Event Loop for >50ms.
- Verify graceful degradation when cache stores become unreachable; ensure fallback paths include explicit timeouts and retry boundaries.

## 🛡️ Consistency & Failure Mode Audit

- Verify cache consistency model aligns with business requirements; flag strict consistency assumptions where eventual consistency is acceptable, or vice versa.
- Audit error handling for cache store unavailability; ensure Redis server failures do not block request processing or corrupt application state.
- Check type safety propagation from cache retrieval through service layers; flag unsafe type assertions or missing nullability handling for cache misses.
- Verify cache responses do not leak internal store details, connection strings, serialization errors, or provider-specific metadata to client API payloads.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for cache client defaults, serialization best practices, or Node.js memory/stream performance hooks before flagging findings.
- Mention briefly in the audit report which documentation was checked and how it influenced severity classification.
- Known Library IDs:
  - ioredis: /redis/ioredis
  - Node.js Performance Hooks: /nodejs/node
  - Node.js Streams: /nodejs/node
  - Express Caching Patterns: /expressjs/express

## 🚫 Anti-Patterns to Flag

- Caching dynamic, user-specific, or frequently mutating data without explicit invalidation or scoped keys.
- Indefinite TTLs or missing expiration policies causing unbounded cache growth and stale data delivery.
- Synchronous, blocking cache operations inside async request handlers or middleware pipelines.
- Ignoring backpressure or buffering entire large responses in memory before streaming to clients.
- Allowing cache stampedes by executing identical fallback queries concurrently to PostgreSQL without request coalescing.
- Returning raw cache internals, store connection details, or serialization errors to API clients.

## 📝 Output Integration

- Map all findings to the core auditor JSON schema using matching strings like `category: "security"`, `category: "express-lifecycle"`, `category: "performance"`, `category: "validation"`, `category: "architecture"`, or `category: "maintainability"`.
- Assign severity based on system impact: `critical` for memory exhaustion, event loop blocking, or unbounded cache growth; `high` for missing invalidation, stampede vulnerability, or inconsistent fallback behavior; `medium` for missing TTLs, weak key scoping, or type safety gaps; `low` for minor configuration redundancy.
- Provide precise line ranges, violated cache/performance rules, evidence context, and directional recommendations. Never generate code.
- Merge findings into the single JSON report block required by `backend-auditor`.
