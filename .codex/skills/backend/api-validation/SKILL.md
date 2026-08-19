---
name: api-validation
description: Implements robust, type-safe validation using Zod for Express + TypeScript backends. Handles request input, response validation, environment variables, and unified error formatting.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, Zod 3.x. Explicitly optimized for schema inference and type-safe middleware chains.
metadata:
  author: junforever
  version: '1.0'
  category: input-handling
---

# API Validation Skill (Zod) for Express + TypeScript

Apply this skill ONLY when the task involves input/output validation, schema enforcement using Zod, type coercion, environment validation, or standardized error formatting.

## 🎯 When to Activate

Activate this skill when the task involves:

- Validating incoming request bodies, URL query parameters, route params, or custom headers before controller execution.
- Validating environment variables at application startup (fail-fast pattern) to ensure critical configs are present and correctly typed.
- Validating responses from external APIs or internal services when data crosses trust boundaries.
- Implementing complex, conditional, or cross-field validation rules (e.g., using Zod `.refine()` or `.superRefine()`).
- Performing type coercion, date normalization, string trimming, or safe data transformations prior to business logic.
- Composing reusable or extended schemas across multiple endpoints, models, or feature modules.
- Standardizing validation error responses (formatting ZodErrors) into a predictable JSON client format.

## ✅ Schema Design & Validation Strategy

- Define explicit, declarative Zod schemas for all input/output points before any data reaches a service layer or external call.
- Enforce strict parsing patterns by default. Use `.strict()` to reject unknown fields or `.strip()` to safely remove them, preventing silent structural failures or payload injection vectors.
- Implement cross-field and conditional validation rules directly within the Zod schema definitions rather than writing imperative evaluation blocks in the controller.
- Use Zod's native type coercion features (`z.coerce`) and transformation pipelines (`.transform()`) to safely normalize and parse input data.
- Validate pagination limits, sorting direction, and filtering keywords against explicit allowlists (e.g., using `z.enum()`) to prevent resource exhaustion or query manipulation.

## 🔍 Request Data Handling & Transformation

- Execute validation early in the Express request lifecycle by using dedicated middleware functions positioned immediately before route controllers.
- Extract and forward ONLY the validated, parsed data payload outputted by Zod (`schema.parse()` or `schema.safeParse().data`). Never pass raw or partially validated request objects downstream.
- Halt route execution and return a structured 400 Bad Request error response immediately when input parameters fail verification.
- Ensure any asynchronous custom validation rules (e.g., database availability checks via Zod async parsing) are properly awaited and safely bounded with timeouts.

## 📦 Error Formatting & Response Contracts

- Catch Zod validation failures (`ZodError`) and map them to a consistent, project-wide JSON structure that clearly isolates field-level issues.
- Return structured error arrays or objects containing the explicit field location path (`error.issues[].path`), the violation type, and clean, human-readable messages.
- **CRITICAL**: Omit internal schema design names, system file traces, or verbose library internals from client-facing error payloads.
- Aggregate all validation failures into a single cohesive error array response per request, rather than failing fast on the very first field violation.

## 🧩 Middleware Integration & Execution Flow

- Implement validation as explicit, reusable middleware factories (e.g., `validateRequest({ body: userSchema })`) that smoothly attach the parsed data to the Express request context (e.g., `req.validatedBody`).
- Position validation middleware exactly after Express body/query parsers and completely before authentication or core business controllers.
- Manage middleware parsing failures centrally through an Express global error handling middleware, translating raw library errors into uniform API contracts.

## 📦 TypeScript Typing & Schema Contracts

- Leverage full compile-time and runtime alignment by inferring explicit TypeScript types directly from the Zod schemas using `z.infer<typeof schema>`.
- Define strict request input interfaces that completely mirror inferred schema structures, adopting zero-tolerance for type widenings or `any`.
- Utilize Zod type guards and narrowed utility outputs to safely transport data shapes across middleware, services, and route handlers without requiring unsafe type casts.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for Zod API structures, schema extension methods, built-in string validations, and error parsing utilities.
- Mention briefly in the output which documentation was consulted and how it guided schema construction or middleware error formatting.
- Known Library IDs:
  - Zod: /colinhacks/zod

## 🚫 Anti-Patterns to Avoid

- Bypassing validation or reading raw unparsed request inputs inside core services or database operations.
- Validating manually with `if` statements or custom regex when native Zod primitives or methods exist (e.g., `z.string().email()`, `z.string().uuid()`).
- Leaving schemas completely open to unknown fields or using permissive parsing without a documented security exception.
- Mixing input schema validation mechanics with deep business workflow constraints or database persistence executions.
- Returning unformatted, raw library stacks or developer-oriented error strings directly to client payloads.
- Duplicating structural interfaces manually in TypeScript instead of utilizing automated Zod schema type inference (`z.infer`).

## 📝 Output Expectations

- Provide Zod schema definitions and the generic request validation middleware first, followed by the error transformer logic, then route integration examples.
- Include explicit TypeScript interfaces inferred natively from the input validation schemas.
- Document validation constraints, specific coercion structures, and error aggregation choices within code comments.
- Ensure the output strictly complies with TypeScript strict mode compilation, maintaining absolute type contract safety throughout.
