import { performance } from 'node:perf_hooks';
import type { Server } from 'node:http';

import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ResponseSlot, TurnSnapshotResponse } from '../types/conversations.js';
import { createControlledProviders } from '../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversationRequests,
} from '../test/integration/testDatabase.js';

const WARM_UP_QUERIES = 1;
const MEASURED_QUERIES = 20;
const TERMINAL_DEADLINE_MS = 60_000;
const POLL_INTERVAL_MS = 10;
const REQUIRED_SUCCESS_RATE = 0.95;
const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const EXPECTED_SLOTS = new Set<ResponseSlot>([
  'base-1',
  'base-2',
  'base-3',
  'consolidator',
]);

describe.sequential('SC-001 controlled terminal-state acceptance', () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;
  let backend: ReturnType<typeof createIntegrationBackend>;
  const ownedRequestIds = Array.from({ length: WARM_UP_QUERIES + MEASURED_QUERIES }, (_, index) =>
    acceptanceRequestId(index)
  );

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
    await deleteOwnedConversationRequests(pool, ownedRequestIds);

    const providers = createControlledProviders();
    assertFakeProviders(providers);
    backend = createIntegrationBackend(pool, providers);
    ({ server, baseUrl } = await startLoopbackServer(backend.app));
  });

  afterEach(async () => {
    await backend?.conversationService.stop();
    await deleteOwnedConversationRequests(pool, ownedRequestIds);
  });

  afterAll(async () => {
    await closeServer(server);
    await pool?.end();
  });

  it('reaches an explicit terminal state in all four slots within 60 seconds for at least 95% of queries', async () => {
    const warmUp = await runQuery(ownedRequestIds[0]!, 'SC-001 deterministic warm-up');
    expect(warmUp.success).toBe(true);

    const results = [];
    for (let index = 0; index < MEASURED_QUERIES; index += 1) {
      results.push(
        await runQuery(
          ownedRequestIds[index + WARM_UP_QUERIES]!,
          `SC-001 controlled query ${index + 1}`
        )
      );
    }

    const successes = results.filter(({ success }) => success).length;
    const successRate = successes / MEASURED_QUERIES;
    const summary = {
      criterion: 'SC-001',
      warmUpQueries: WARM_UP_QUERIES,
      total: MEASURED_QUERIES,
      successes,
      percentage: Number((successRate * 100).toFixed(2)),
      deadlineMs: TERMINAL_DEADLINE_MS,
      maximumObservedMs: Number(
        Math.max(...results.map(({ durationMs }) => durationMs)).toFixed(2)
      ),
      decision: successRate >= REQUIRED_SUCCESS_RATE ? 'pass' : 'fail',
    };

    process.stdout.write(`[performance-acceptance] ${JSON.stringify(summary)}\n`);
    expect(successRate).toBeGreaterThanOrEqual(REQUIRED_SUCCESS_RATE);
  }, 1_265_000);

  async function runQuery(
    clientRequestId: string,
    prompt: string
  ): Promise<{ success: boolean; durationMs: number }> {
    const startedAt = performance.now();
    const accepted = await request(baseUrl).post('/api/v1/conversations').send({
      clientRequestId,
      prompt,
    });

    if (
      accepted.status !== 202 ||
      !isIdentifier(accepted.body?.conversation?.id) ||
      !isIdentifier(accepted.body?.turn?.id)
    ) {
      return { success: false, durationMs: performance.now() - startedAt };
    }

    const conversationId = accepted.body.conversation.id as string;
    const turnId = accepted.body.turn.id as string;
    while (performance.now() - startedAt < TERMINAL_DEADLINE_MS) {
      const snapshot = await request(baseUrl).get(
        `/api/v1/conversations/${conversationId}/turns/${turnId}`
      );
      const durationMs = performance.now() - startedAt;
      if (snapshot.status === 200 && hasFourTerminalSlots(snapshot.body)) {
        return { success: durationMs < TERMINAL_DEADLINE_MS, durationMs };
      }
      await delay(POLL_INTERVAL_MS);
    }

    return { success: false, durationMs: performance.now() - startedAt };
  }
});

function acceptanceRequestId(index: number): string {
  return `11500000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function assertFakeProviders(providers: ReturnType<typeof createControlledProviders>): void {
  if (Object.values(providers).some(({ provider }) => !provider.endsWith('-fake'))) {
    throw new Error('SC-001 requires deterministic fake providers');
  }
}

function hasFourTerminalSlots(value: unknown): boolean {
  const snapshot = value as Partial<TurnSnapshotResponse>;
  const responses = snapshot.turn?.responses;
  return (
    Array.isArray(responses) &&
    responses.length === EXPECTED_SLOTS.size &&
    new Set(responses.map(({ slot }) => slot)).size === EXPECTED_SLOTS.size &&
    responses.every(({ slot, status }) => EXPECTED_SLOTS.has(slot) && TERMINAL_STATUSES.has(status))
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function startLoopbackServer(
  app: ReturnType<typeof createIntegrationBackend>['app']
): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
    candidate.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    await closeServer(server);
    throw new Error('SC-001 server must bind to IPv4 loopback');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
