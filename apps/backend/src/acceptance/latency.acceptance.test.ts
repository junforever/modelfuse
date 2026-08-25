import type { Server } from 'node:http';
import { performance } from 'node:perf_hooks';

import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createControlledProviders } from '../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversationRequests,
} from '../test/integration/testDatabase.js';

const WARM_UP_SAMPLES = 2;
const MEASURED_SAMPLES = 20;
const LATENCY_THRESHOLD_MS = 1_000;
const REQUIRED_SUCCESS_RATE = 0.95;

interface EndpointSample {
  durationMs: number | null;
  statusOk: boolean;
}

describe.sequential('SC-010 controlled endpoint latency acceptance', () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;
  let backend: ReturnType<typeof createIntegrationBackend>;
  const ownedRequestIds = Array.from({ length: WARM_UP_SAMPLES + MEASURED_SAMPLES }, (_, index) =>
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

  it('keeps create-201 and first-history-page p95 below one second', async () => {
    for (let index = 0; index < WARM_UP_SAMPLES; index += 1) {
      const warmUp = await collectEndpointPair(
        ownedRequestIds[index]!,
        `SC-010 deterministic warm-up ${index + 1}`
      );
      expect(warmUp.create.statusOk).toBe(true);
      expect(warmUp.history.statusOk).toBe(true);
    }

    const createSamples: EndpointSample[] = [];
    const historySamples: EndpointSample[] = [];
    for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
      const measured = await collectEndpointPair(
        ownedRequestIds[index + WARM_UP_SAMPLES]!,
        `SC-010 controlled sample ${index + 1}`
      );
      createSamples.push(measured.create);
      historySamples.push(measured.history);
    }

    const create = summarizeEndpoint('POST /api/v1/conversations', createSamples);
    const firstHistory = summarizeEndpoint(
      'GET /api/v1/conversations/:conversationId/turns',
      historySamples
    );
    process.stdout.write(
      `[performance-acceptance] ${JSON.stringify({
        criterion: 'SC-010',
        clock: 'performance.now',
        percentileMethod: 'nearest-rank',
        warmUpSamples: WARM_UP_SAMPLES,
        measuredSamples: MEASURED_SAMPLES,
        create,
        firstHistory,
        decision: create.pass && firstHistory.pass ? 'pass' : 'fail',
      })}\n`
    );

    expect(create.pass).toBe(true);
    expect(firstHistory.pass).toBe(true);
  }, 65_000);

  async function collectEndpointPair(
    clientRequestId: string,
    prompt: string
  ): Promise<{ create: EndpointSample; history: EndpointSample }> {
    const createStartedAt = performance.now();
    const accepted = await request(baseUrl).post('/api/v1/conversations').send({
      clientRequestId,
      prompt,
    });
    const createDurationMs = performance.now() - createStartedAt;
    const conversationId = accepted.body?.conversation?.id;
    const createStatusOk = accepted.status === 201 && isIdentifier(conversationId);

    if (!createStatusOk) {
      return {
        create: { durationMs: createDurationMs, statusOk: false },
        history: { durationMs: null, statusOk: false },
      };
    }

    await backend.conversationService.stop();
    const historyStartedAt = performance.now();
    const history = await request(baseUrl).get(`/api/v1/conversations/${conversationId}/turns`);
    const historyDurationMs = performance.now() - historyStartedAt;
    return {
      create: { durationMs: createDurationMs, statusOk: true },
      history: {
        durationMs: historyDurationMs,
        statusOk: history.status === 200 && Array.isArray(history.body?.items),
      },
    };
  }
});

function summarizeEndpoint(operation: string, samples: readonly EndpointSample[]) {
  const durations = samples.flatMap(({ durationMs }) => (durationMs === null ? [] : [durationMs]));
  const successes = samples.filter(
    ({ durationMs, statusOk }) =>
      statusOk && durationMs !== null && durationMs < LATENCY_THRESHOLD_MS
  ).length;
  const successRate = successes / samples.length;
  const p95Ms = durations.length === samples.length ? percentile(durations, 95) : null;
  return {
    operation,
    total: samples.length,
    successes,
    errors: samples.length - successes,
    percentage: Number((successRate * 100).toFixed(2)),
    thresholdMs: LATENCY_THRESHOLD_MS,
    p50Ms: durations.length > 0 ? round(percentile(durations, 50)) : null,
    p95Ms: p95Ms === null ? null : round(p95Ms),
    maximumMs: durations.length > 0 ? round(Math.max(...durations)) : null,
    pass: successRate >= REQUIRED_SUCCESS_RATE && p95Ms !== null && p95Ms < LATENCY_THRESHOLD_MS,
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) throw new Error('Cannot calculate a percentile without samples');
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentileValue / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)]!;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function acceptanceRequestId(index: number): string {
  return `11600000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function assertFakeProviders(providers: ReturnType<typeof createControlledProviders>): void {
  if (Object.values(providers).some(({ provider }) => !provider.endsWith('-fake'))) {
    throw new Error('SC-010 requires deterministic fake providers');
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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
    throw new Error('SC-010 server must bind to IPv4 loopback');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
