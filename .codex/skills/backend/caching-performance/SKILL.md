---
name: caching-performance
description: Implements efficient caching strategies, memory management, and performance optimizations using Redis for Express + TypeScript backends. Use when configuring external caches, response caching, query optimization, or addressing documented performance bottlenecks.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, ioredis 5+. Compatible with CDN edge caching, database-level caching, or custom cache adapters.
metadata:
  author: junforever
  version: '1.0'
  category: performance
---

# Caching & Performance Skill (Redis) for Express + TypeScript

Apply this skill ONLY when the task involves implementing caching layers, optimizing query execution, managing memory constraints, or improving endpoint response times. For standard CRUD endpoints without performance requirements, use the core agent rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Configuring external cache stores (Redis via `ioredis`) or in-memory caching layers.
- Implementing response caching, cache-aside, write-through, or read-through patterns.
- Optimizing database queries, preventing N+1 patterns, or improving pagination efficiency.
- Managing cache invalidation, TTL strategies, versioning, or stale data reconciliation.
- Addressing event loop blocking, memory pressure, or garbage collection bottlenecks.
- Implementing stream processing, backpressure handling, or lazy loading for large payloads.
- Integrating CDN caching headers, edge routing rules, or proxy cache invalidation.

## ⚡ Caching Strategy & Implementation

- Select cache patterns explicitly based on data volatility, access frequency, and consistency requirements; avoid indiscriminate caching of all responses.
- Define explicit, deterministic cache keys that incorporate user context, pagination parameters, and query filters to prevent cache collisions or stale reads across tenants.
- Set explicit Time-To-Live (TTL) values for all cached entries; never rely on indefinite caching unless justified by static, immutable data configurations.
- Implement cache warming or background refresh strategies for high-traffic, frequently accessed data to prevent cold-start latency or thundering herd effects.
- Serialize and compress cached payloads efficiently when storing large or complex objects; avoid storing unstructured or unbounded binary data in memory-backed caches.

## 📈 Performance Optimization & Query Efficiency

- Execute database queries with explicit limits, offsets, and indexed filter conditions to prevent full table scans and unbounded result sets.
- Fetch only required fields using projection or field selection; avoid returning entire entity objects when clients consume subsets.
- Batch related data fetches into single, optimized queries instead of executing sequential, dependent lookups.
- Offload CPU-intensive or blocking computations to worker threads, message queues, or deferred processing when they exceed safe event loop thresholds (>50ms).
- Use streaming APIs for large payloads, file transfers, or aggregation pipelines; avoid buffering entire datasets in memory before response transmission.
- Profile and identify hot paths before applying optimizations; do not introduce complexity for theoretical or unmeasured performance gains.

## 🔄 Cache Invalidation & Lifecycle Management

- Implement explicit cache invalidation on data mutations; ensure write operations (POST, PUT, DELETE) trigger precise cache eviction or version bumps for affected keys.
- Use namespace or prefix strategies (e.g., `user:123:profile`) to isolate cache domains and enable bulk invalidation by feature, tenant, or resource type.
- Handle cache miss scenarios gracefully by falling back to authoritative data sources without cascading failures or duplicate concurrent fetches.
- Implement request coalescing or mutex patterns for cache stampede prevention when multiple clients request the same uncached resource simultaneously.
- Monitor cache hit/miss ratios and eviction rates; adjust TTLs, key structures, or storage capacity when degradation impacts endpoint latency.
- Ensure cache consistency aligns with business requirements; relax strict consistency only when eventual consistency is explicitly acceptable and documented.

## 🛡️ Memory Management & Resource Constraints

- Enforce explicit memory limits for in-memory caches, buffers, and request payloads to prevent heap exhaustion and uncontrolled garbage collection cycles.
- Use Node.js streaming pipelines with proper backpressure handling (e.g., using pipeline or pump streams) to avoid queue buildup or event loop starvation during high-throughput scenarios.
- Avoid synchronous filesystem operations, blocking cryptographic calls, or large string concatenations inside request handlers.
- Implement graceful degradation when cache stores become unreachable; fallback to direct data sources with explicit timeout and retry boundaries.

## 📦 TypeScript Typing & Configuration Contracts

- Define explicit, strongly-typed configuration interfaces for cache clients, TTL defaults, retry policies, and serialization options.
- Type cache response wrappers to distinguish between cache hits, misses, fallback states, and refresh cycles without unsafe assertions.
- Ensure type safety propagates from cache retrieval through service layers to route handlers, preserving nullability and optional field constraints.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for library-specific APIs, cache store configurations, or Node.js performance hooks before implementing.
- Mention briefly in the output which documentation was consulted and how it influenced cache strategy, TTL configuration, or memory management decisions.
- Known Library IDs:
  - ioredis: /redis/ioredis
  - Node.js Performance: /nodejs/node
  - Node.js Streams: /nodejs/node
  - express-rate-limit: /express-rate-limit/express-rate-limit (for throttling integration)

## 🚫 Anti-Patterns to Avoid

- Caching dynamic, user-specific, or frequently mutating data without explicit invalidation or scoped cache keys.
- Using indefinite TTLs or missing expiration policies that cause unbounded cache growth and stale data delivery.
- Implementing synchronous, blocking operations inside request handlers or cache middleware.
- Ignoring backpressure or buffering entire large responses in memory before streaming to clients.
- Caching sensitive or tenant-isolated data without explicit scoping, encryption, or access boundary enforcement.
- Allowing cache stampedes by executing identical fallback queries concurrently without request coalescing.
- Mixing cache logic with business validation, route handling, or error formatting in monolithic functions.
- Returning raw cache internals, store connection details, or serialization errors to API clients.

## 📝 Output Expectations

- Provide cache client connection configuration first, followed by custom caching middleware or services, then data optimization and stream piping pipelines.
- Include explicit TypeScript type definitions for custom cache responses and connection option wrappers.
- Document implementation choices including key structure schemas, cache validation scopes, eviction choices, and performance baseline measurements within comments.
- Ensure full compilation under TypeScript strict mode, applying zero-tolerance for type overrides or `any`.
