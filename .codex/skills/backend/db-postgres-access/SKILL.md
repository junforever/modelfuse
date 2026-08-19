---
name: db-postgres-access
description: Implements secure, efficient, and maintainable PostgreSQL access patterns using Prisma or Drizzle ORM for Express + TypeScript backends. Handles type-safe queries, transactions, connection pooling, and migrations.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, Prisma 5+ or Drizzle ORM 0.x. Explicitly optimized for PostgreSQL database engines.
metadata:
  author: junforever
  version: '1.0'
  category: data-persistence
---

# PostgreSQL Database Access Skill (Prisma / Drizzle) for Express + TypeScript

Apply this skill ONLY when the task involves PostgreSQL database interactions, type-safe query execution, transaction management, or data access layer implementation using Prisma or Drizzle ORM.

## 🎯 When to Activate

Activate this skill when the task involves:

- Initializing the ORM client instance, configuring connection limits, or managing connection lifecycles.
- Executing type-safe SELECT, INSERT, UPDATE, or DELETE statements using Prisma Client or Drizzle queries.
- Implementing ACID transactional workflows requiring atomic multi-step execution or conditional rollbacks.
- Structuring data repositories, services, or optimized relational fetching patterns.
- Handling database schema migrations, schema pushes, or seed data execution.
- Optimizing slow queries, defining explicit PostgreSQL indexes, or enforcing cursor/offset pagination.
- Managing database connection timeouts, retry strategies, and graceful shutdowns during server termination.

## 🔌 Connection & Pool Management

- Initialize the Prisma Client or Drizzle database connection during application startup; validate database connectivity before serving external requests.
- Configure PostgreSQL connection pooling parameters (max connections, idle timeouts) using environment variables (e.g., `DATABASE_URL` query parameters or pooling variables like PgBouncer configuration).
- Implement a graceful shutdown routine on application termination to explicitly disconnect the client and prevent orphaned PostgreSQL connection slots.
- Use environment-specific configuration exclusively for credentials, host, port, and schema names; never hardcode connection strings or target local strings in production.

## 🛡️ Query Construction & Data Safety

- Ensure all query builders naturally utilize parameterized bindings; never fall back to raw string concatenation when writing complex or raw SQL queries with Prisma (`$queryRawUnsafe`) or Drizzle (`sql.raw`).
- Validate and sanitize input objects before introducing them to the ORM methods; enforce validation boundaries using schema definitions.
- Implement mandatory explicit pagination (limits and offsets/cursors) for all list-fetching endpoints to prevent database out-of-memory errors.
- Prevent N+1 query patterns by utilizing explicit relation inclusions (Prisma `include`/`select`) or relational query mappings (Drizzle relational API or explicit joins).
- Structure query conditions to match existing database indexes; flag unindexed filtering or sorting routines on high-traffic endpoints.

## 🔁 Transactions & Consistency

- Wrap multi-step relational writes that require atomicity in explicit ORM transactions:
  - **Prisma**: Use sequential arrays (`$transaction([query1, query2])`) or interactive transactions (`$transaction(async (tx) => { ... })`).
  - **Drizzle**: Use the nested block pattern (`db.transaction(async (tx) => { ... })`).
- Keep transaction scopes as narrow as possible; avoid enclosing heavy business computations or slow network calls inside the database transaction block to prevent lock contention.
- Propagate the transaction client instance (`tx`) explicitly to internal services to maintain a shared context across nested operations.

## ⚠️ Error Handling & PostgreSQL Mapping

- Catch and classify ORM-specific database errors (e.g., Prisma unique constraint violation `P2002` or Drizzle/Postgres code `23505`); map them to appropriate HTTP status codes (e.g., 409 Conflict).
- Never expose raw database engine error payloads, constraint titles, or internal schema schemas directly to client API responses.
- Log meaningful database error metadata for auditing and diagnostics while redacting sensitive parameter bindings or query credentials.
- Ensure clean transactional rollbacks: partially completed writes must be naturally reverted by the database transaction framework if a sub-step fails.

## 📦 TypeScript Typing & Data Contracts

- Enforce full type propagation using the inferred types supplied natively by the ORM (e.g., `Prisma.UserGetPayload` or Drizzle table models).
- Isolate raw database model types inside the data access layer; map database models to clean business domain types or explicit API response DTOs before exposing data to higher-level modules.
- Ensure type-safe schema validation maps flawlessly to nullable or optional PostgreSQL column configurations.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for ORM-specific APIs, connection string formatting, migration tool controls, or PostgreSQL driver configurations.
- Mention briefly in the output which documentation was consulted and how it influenced the final code structure.
- Known Library IDs:
  - Prisma: /prisma/prisma
  - Drizzle ORM: /drizzle-team/drizzle-orm
  - PostgreSQL Driver: /brianc/node-postgres

## 🚫 Anti-Patterns to Avoid

- Injecting raw, unsanitized user strings into raw database execution blocks without explicit parameterized tokens.
- Executing unbounded database queries without pagination, forcing maximum row extractions.
- Spawning new ORM client instances inside Express request handlers or middleware, which collapses connection pooling.
- Mixing PostgreSQL-specific logic with dialect configurations belonging to unrelated database types (like MySQL or MongoDB).
- Returning internal auto-incremented identifiers or physical schema layouts directly to external client payloads without clean DTO translation.
- Performing synchronous operations that lock the event loop during heavy async database tasks.

## 📝 Output Expectations

- Provide connection initialization and pool configuration first, followed by schemas/model relations, then type-safe query/transaction logic.
- Include explicit TypeScript interfaces for query targets, parameter objects, and output mapping responses.
- Document architectural choices including client lifecycle controls, index utilization strategies, and specific error code mapping.
- Ensure full compilation under TypeScript strict mode, applying zero-tolerance for type overrides or `any`.
- Mention briefly when Context7 was consulted for ORM configurations and what implementation pattern it guided.
