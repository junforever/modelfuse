# Local E2E runtime

Playwright starts the test-only backend and Vite itself. The backend uses only
deterministic fake LLM providers; provider credentials are neither required nor
loaded.

Before running, provide a migrated, disposable PostgreSQL database on loopback.
Its database name must contain `test`:

```powershell
$env:MODELFUSE_TEST_DATABASE_URL = 'postgresql://<test-user>:<test-password>@127.0.0.1:5432/modelfuse_test'
pnpm --filter frontend test:e2e -- conversation-comparison.spec.ts conversation-response-actions.spec.ts
```

The run ID is generated automatically. Test teardown deletes only conversation
IDs created by that run; schema creation and Liquibase migration remain external
preconditions.
