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
        NODE_ENV: 'test',
        FRONTEND_URL_LOCALHOST: E2E_FRONTEND_ORIGIN,
      },
      url: `${E2E_BACKEND_ORIGIN}/__e2e/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --open false',
      cwd: import.meta.dirname,
      env: {
        VITE_API_BASE_URL: E2E_API_BASE_URL,
      },
      url: E2E_FRONTEND_ORIGIN,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
