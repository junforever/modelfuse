# Local E2E runtime

Playwright starts the test-only backend and Vite itself. The backend uses only
deterministic fake LLM providers; provider credentials are neither required nor
loaded.

Before running, set `MODELFUSE_TEST_DATABASE_URL` in
`apps/backend/.env.integration` to a migrated, disposable PostgreSQL database on
loopback. Its database name must contain `test`. Run the integration preflight
once before the E2E command block, then pass the same env file to every dependent
wrapper invocation because process environments do not persist:

```powershell
& .\agent-scripts\preflight-integration.ps1 -EnvFile apps/backend/.env.integration
& .\agent-scripts\run-pnpm.ps1 -EnvFile apps/backend/.env.integration -- --filter frontend test:e2e -- conversation-comparison.spec.ts conversation-response-actions.spec.ts
```

The run ID is generated automatically. Test teardown deletes only conversation
IDs created by that run; schema creation and Liquibase migration remain external
preconditions.
