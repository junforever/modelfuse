import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

import { defineConfig } from '@playwright/test';

import { E2E_API_BASE_URL, E2E_BACKEND_ORIGIN, E2E_FRONTEND_ORIGIN } from './e2e/support/scenarios';

const runId = process.env.MODELFUSE_E2E_RUN_ID ?? randomUUID();
process.env.MODELFUSE_E2E_RUN_ID = runId;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  globalTeardown: './e2e/support/globalTeardown.ts',
  use: {
    baseURL: E2E_FRONTEND_ORIGIN,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'node --conditions=development node_modules/tsx/dist/cli.mjs ../frontend/e2e/support/backend.ts',
      cwd: path.resolve(import.meta.dirname, '../backend'),
      env: {
        MODELFUSE_E2E_RUN_ID: runId,
        MODELFUSE_TEST_DATABASE_URL: process.env.MODELFUSE_TEST_DATABASE_URL ?? '',
        NODE_OPTIONS: '--conditions=development',
        NODE_ENV: 'test',
        FRONTEND_URL_LOCALHOST: E2E_FRONTEND_ORIGIN,
      },
      url: `${E2E_BACKEND_ORIGIN}/__e2e/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command:
        'node --conditions=development ../backend/node_modules/tsx/dist/cli.mjs e2e/support/frontend.ts',
      cwd: import.meta.dirname,
      env: {
        MODELFUSE_E2E_RUN_ID: runId,
        VITE_API_BASE_URL: E2E_API_BASE_URL,
      },
      url: E2E_FRONTEND_ORIGIN,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
