---
name: file-uploads
description: Implements secure, validated file upload handling for Express + TypeScript backends. Use when handling multipart/form-data, file validation, storage strategies, stream processing, or upload lifecycle management.
compatibility: Node.js 18+, Express 4.x/5.x, TypeScript 5+, Multer 1.4+, Zod 3.x. Compatible with S3, Cloudinary, or custom storage adapters.
metadata:
  author: junforever
  version: '1.0'
  category: file-handling
---

# File Uploads Skill for Express + TypeScript

Apply this skill ONLY when the task involves handling file uploads, multipart forms, or binary data processing. For standard JSON/URL-encoded APIs, use the core agent rules instead.

## 🎯 When to Activate

Activate this skill when the task involves:

- Handling `multipart/form-data` requests with explicit file fields.
- Validating file type, size, extension, or MIME type before processing or storage.
- Implementing storage strategies for local disk, cloud providers, or custom adapters.
- Processing file streams for large payloads or transformation pipelines.
- Generating secure, unique filenames and preventing path traversal vulnerabilities.
- Supporting upload progress tracking, chunked uploads, or resumable transfer protocols.
- Managing temporary files, cleanup routines, or upload lifecycle events.

## 🔐 Security & Input Sanitization

- Treat all uploaded files and metadata as strictly untrusted; never execute, evaluate, or serve them directly without validation.
- Sanitize and normalize all filenames by stripping path separators, control characters, and leading dots to prevent directory traversal attacks.
- Generate unique, non-predictable storage identifiers using UUIDs, cryptographic hashes, or timestamp-based randomization; never rely on client-provided names for filesystem paths.
- Validate MIME types through both extension allowlists and magic-byte inspection to prevent extension spoofing.
- Enforce strict payload and per-file size limits at both the middleware layer and the application layer; reject oversized requests before allocation.
- Store files outside publicly accessible web roots or serve them exclusively through controlled routes with explicit content-type and security headers.
- Avoid constructing storage paths dynamically from unsanitized user input; restrict destinations to predefined, permission-controlled directories.
- Implement guaranteed cleanup routines for temporary files using `finally` blocks, stream error handlers, or request abort signals to prevent disk exhaustion.

## ✅ Validation & Schema Enforcement

- Define explicit validation schemas for upload metadata and file constraints using Zod or equivalent schema libraries.
- Enforce allowlist-based validation for accepted file types, MIME categories, and maximum file counts per request.
- Cross-validate file extensions against detected MIME types; reject mismatches with structured, user-friendly error responses.
- Return consistent validation error shapes that distinguish between file-level failures and metadata validation failures.
- Never rely on client-side constraints or frontend validation as a security boundary; enforce all rules server-side before processing begins.

## 🗄️ Storage Architecture & Stream Processing

- Abstract storage logic behind a well-defined interface to enable swapability between local, cloud, and custom providers.
- Prefer streaming pipelines over in-memory buffering for files exceeding reasonable memory thresholds to prevent process crashes or garbage collection spikes.
- Configure external storage clients with explicit timeouts, retry policies, and error isolation; avoid blocking request handlers on slow network operations.
- Document the chosen storage strategy, retention policies, access control mechanisms, and CDN integration patterns directly in the implementation context.
- Handle provider-specific errors gracefully; map internal storage failures to appropriate HTTP status codes without leaking infrastructure details.

## 🧩 Middleware & Express Configuration

- Configure upload middleware with explicit, minimal options; avoid permissive catch-all parsers.
- Restrict accepted fields to explicitly declared names using single-field or structured multi-field configurations; never use unbounded field acceptance.
- Handle middleware-level errors centrally by mapping limit violations, unexpected fields, and parsing failures to standardized error responses.
- Ensure middleware execution order places upload parsing after security headers and before business logic; avoid mixing file parsing with unrelated middleware.
- Keep route handlers focused exclusively on validation delegation, storage invocation, and response formatting.

## 📦 TypeScript Typing & Response Contracts

- Type all file objects, metadata payloads, and storage results explicitly; utilize standard extended namespaces such as `Express.Multer.File` and avoid `any` or implicit array handling.
- Define structured response contracts for successful uploads that include file identifiers, access URLs, size, and timestamps.
- Use discriminated unions or explicit status fields for tracking asynchronous upload processing, transformations, or queued jobs.
- Export clear type definitions for validation errors, storage failures, and success payloads to ensure consistency across controllers and clients.

## 🔍 STANDARDS & DOCUMENTATION

- Consult Context7 for library-specific APIs, version-breaking changes, or security recommendations before implementing upload logic.
- Mention briefly in the output which documentation was consulted and how it influenced configuration choices or security decisions.
- Known Library IDs:
  - Multer: /expressjs/multer
  - AWS SDK v3: /aws/aws-sdk-js-v3
  - file-type: /sindresorhus/file-type
  - Zod: /colinhacks/zod
  - sharp: /lovell/sharp

## 🚫 Anti-Patterns to Avoid

- Using unbounded or catch-all multipart parsers without explicit field restrictions.
- Trusting `originalname`, `mimetype`, or client-provided metadata without server-side verification.
- Constructing filesystem paths directly from user input without sanitization or directory confinement.
- Loading entire uploaded payloads into memory buffers for processing or validation.
- Storing files in publicly accessible directories without access controls, signed URLs, or proxy routing.
- Skipping temporary file cleanup on request failure, timeout, or stream interruption.
- Using synchronous filesystem or stream operations inside asynchronous request handlers.
- Returning internal storage paths, provider credentials, or infrastructure identifiers in API responses.

## 📝 Output Expectations

- Provide middleware configuration and validation schemas first, followed by the route handler, then storage adapter implementation.
- Include explicit TypeScript type definitions for file objects, metadata, validation errors, and response contracts.
- Document security decisions including filename sanitization strategy, MIME validation approach, and storage location rationale.
- Ensure TypeScript compilation passes, linting rules are respected, and upload constraints are enforced at both middleware and application layers.
- Mention briefly when Context7 was consulted for library APIs and how it shaped the implementation or configuration choices.
- Defer comprehensive security auditing, performance profiling, and architectural compliance checks to the dedicated backend-auditor agent.
