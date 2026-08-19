import process from 'node:process';

import { E2E_BACKEND_ORIGIN, E2E_FRONTEND_ORIGIN } from './scenarios.js';

async function stopOwnedServer(origin: string, runId: string): Promise<void> {
  const response = await fetch(new URL('/__e2e/shutdown', origin), {
    method: 'POST',
    headers: { 'x-modelfuse-e2e-run-id': runId },
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== 204) {
    throw new Error(`E2E server at ${origin} rejected owned shutdown with ${response.status}`);
  }
}

export default async function globalTeardown(): Promise<void> {
  const runId = process.env.MODELFUSE_E2E_RUN_ID;
  if (!runId) throw new Error('MODELFUSE_E2E_RUN_ID is required for E2E teardown');

  await Promise.all([
    stopOwnedServer(E2E_FRONTEND_ORIGIN, runId),
    stopOwnedServer(E2E_BACKEND_ORIGIN, runId),
  ]);
}
