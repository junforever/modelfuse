---
name: db-postgres-performance-audit
description: Specialized audit skill for PostgreSQL access patterns, query optimization, transaction management, connection pooling, and Prisma/Drizzle ORM execution bottlenecks in Express + TypeScript backends.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, Prisma 5+ or Drizzle ORM 0.x. Explicitly optimized for PostgreSQL database engines.
metadata:
  author: junforever
  version: '1.0'
  category: data-performance
---

# PostgreSQL Database & Performance Audit Skill for Backend

Apply this skill ONLY when reviewing code involving PostgreSQL database queries, transaction boundaries using Prisma or Drizzle, connection pooling, pagination, or performance-critical data access.

## 🎯 When to Activate

Activate this skill when the audited code involves:

- Raw SQL execution blocks via ORM escapes (e.g., Prisma `$queryRawUnsafe` or Drizzle `sql.raw`) containing user input.
- Multi-step relational operations requiring PostgreSQL ACID transactions, isolation level settings, or explicit rollback handling.
- Connection pool initialization, PgBouncer-compatible configurations, or client slot leakage patterns.
- Pagination, sorting, filtering allowlists, or aggregation pipelines on large PostgreSQL tables.
- Relationship fetching, relation inclusions, or dependent sequential queries that risk blocking states.
- Large data record transformation, stream processing, or memory-bound query result buffers.
- Index usage validation, full table scan identification, or statement timeout/retry boundaries.

## 📊 Query Construction & Data Safety Audit

- Verify parameterized queries or explicit bound bindings; flag raw string interpolation, template literal concatenation, or dynamic query assembly using untrusted user inputs inside Prisma `$queryRawUnsafe` or Drizzle `sql.raw`.
- Audit for N+1 patterns in relationship fetching; detect sequential dependent queries that can be natively replaced by explicit joins, eager loading (Prisma `include`/`select`), or relational batch retrieval (Drizzle relational query API).
- Check for unbounded collection queries missing strict limit caps, cursor definitions, or offset pagination constraints on high-traffic routing endpoints.
- Verify column projection or field selection; flag full entity returns (`SELECT *` equivalents) when clients consume only a minor subset of columns.

## 🔁 Transaction & Concurrency Audit

- Verify explicit transaction boundaries for multi-step atomic operations; flag implicit automatic commits, missing catch rollback blocks, or atomic logic fragmented across independent handlers.
- When evaluating raw postgres client implementations (`pg`), ensure the client instance is captured, handles `BEGIN`/`COMMIT`/`ROLLBACK` sequentially, and guarantees release via `client.release()` inside a strict `finally` block to prevent pool starvation.
- Audit transaction scope lengths; flag long-running transaction blocks enclosing slow third-party API calls, massive loops, or heavy encryption computations that trigger lock contention or PostgreSQL connection exhaustion.
- Propagate transaction contexts explicitly; flag nested write routines that fail to inherit the current transaction client instance (`tx`).

## 🔌 Connection & Pool Management Audit

- Verify ORM client instance initialization occurs once at application startup; flag per-request connection instantiation or ad-hoc client generation inside route controllers.
- Audit pooling limits against deployment architecture configurations (e.g., matching connection limits with reverse proxy topology or connection poolers like PgBouncer).
- Check for graceful lifecycle shutdown hooks that drain pending queries and close the ORM connection on process termination signals (`SIGINT`, `SIGTERM`).
- Flag connection leaks stemming from unhandled promise rejections, unclosed query streams, or orphaned cursors.

## ⚡ Performance & Indexing Audit

- Audit query filtering predicates against known database indexes; flag unindexed filtering or sorting conditions on high-traffic endpoints.
- Verify pagination approaches on massive tables; warn against high offset/limit combinations and recommend cursor/keyset pagination strategies instead.
- Check for CPU-intensive or synchronous data mapping blocking the Event Loop after receiving heavy database query results.
- Audit payload transport; flag buffering massive datasets in memory prior to response execution instead of piping through native Node.js streams.

## 📦 Error Handling & Mapping Audit

- Verify PostgreSQL-specific error codes (e.g., unique constraint violation `23505` / Prisma `P2002`) are caught, classified, and mapped to precise HTTP status codes (e.g., 409 Conflict).
- Flag exposure of raw PostgreSQL engine errors, constraint naming tracks, or physical schema layouts to client responses.
- Check for proper error context logging that isolates query identifiers and operation types while redacting sensitive parameter bindings or credentials.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for Prisma/Drizzle defaults, connection pool limits, query optimization rules, or PostgreSQL statement behaviors.
- Mention briefly in the audit report which documentation was checked and how it shaped the severity classification.
- Known Library IDs:
  - Prisma: /prisma/prisma
  - Drizzle ORM: /drizzle-team/drizzle-orm
  - PostgreSQL/Node: /brianc/node-postgres
  - Node.js Streams: /nodejs/node

## 🚫 Anti-Patterns to Flag

- Dynamic query assembly or string concatenation without explicit parameterized tokens.
- Instantiating ORM client instances inside Express request handlers or middleware, collapsing the connection pool.
- Returning raw database error stacks, model columns, or physical internal schemas to external API clients.
- Synchronous database operations, blocking result transformations, or buffering entire large payloads in async paths.
- N+1 sequential fetches, unindexed filters on hot paths, or unbounded offset/limit allocations.

## 📝 Output Integration

- Map all findings to the core auditor JSON schema using `category: "typescript"`, `category: "express-lifecycle"`, `category: "security"`, `category: "validation"`, `category: "architecture"`, or `category: "maintainability"`.
- Assign severity logically: `critical` for raw injection points, data corruption, or event loop blocking; `high` for unbounded queries, pool leaks, or missing transactions; `medium` for N+1 patterns or unindexed paths; `low` for minor type anomalies or redundant mapping ceremonies.
- Merge findings cleanly into the single JSON report block required by `backend-auditor`. Never generate code snippets.
