import { Server } from 'node:http';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp as createExpressApp } from '../app.js';
import { createControlledProviders, deferred } from '../test/integration/controlledLlmProviders.js';
import {
  createIntegrationPool,
  deleteOwnedConversationRequests,
} from '../test/integration/testDatabase.js';
import type { UnsequencedTurnEvent } from '../services/conversations/turnEventPublisher.js';

const LIFECYCLE_REQUEST_ID = '10000000-0000-4000-8000-000000000046';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('backend application lifecycle', () => {
  it('returns a client-safe JSON error through the real Express middleware', async () => {
    const { createApp } = await import('../app.js');

    const response = await request(createApp())
      .post('/api/v1/conversations')
      .set('content-type', 'application/json')
      .send('{"secret":"must-not-leak",');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      code: 'INVALID_JSON',
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /must-not-leak|SyntaxError|stack|apps[\\/]backend/i
    );
  });

  it('keeps module imports passive and delegates listening to start/stop', async () => {
    vi.resetModules();
    const listenSpy = vi.spyOn(Server.prototype, 'listen');
    const originalSigintListeners = new Set(process.listeners('SIGINT'));
    const originalSigtermListeners = new Set(process.listeners('SIGTERM'));

    const { createApp } = await import('../app.js');
    const { startServer, stopServer } = await import('../server.js');
    await import('../index.js');

    expect(createApp).toBeTypeOf('function');
    expect(listenSpy).not.toHaveBeenCalled();

    let server: Server | undefined;
    try {
      server = await startServer(0);
      expect(server.listening).toBe(true);
      expect(listenSpy).toHaveBeenCalledOnce();

      await stopServer(server);
      expect(server.listening).toBe(false);
    } finally {
      if (server?.listening) {
        await stopServer(server);
      }

      for (const listener of process.listeners('SIGINT')) {
        if (!originalSigintListeners.has(listener)) {
          process.removeListener('SIGINT', listener);
        }
      }
      for (const listener of process.listeners('SIGTERM')) {
        if (!originalSigtermListeners.has(listener)) {
          process.removeListener('SIGTERM', listener);
        }
      }
    }
  });

  it('uses only the configured frontend origin with credentialed CORS', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FRONTEND_URL_LOCALHOST', 'https://frontend.example.test');

    const response = await request(createExpressApp())
      .options('/api/v1/conversations')
      .set('origin', 'https://untrusted.example.test')
      .set('access-control-request-method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBe('https://frontend.example.test');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'not-an-origin'],
  ] as const)('fails closed when the frontend origin is %s', async (_case, configuredOrigin) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FRONTEND_URL_LOCALHOST', configuredOrigin);

    let app;
    try {
      app = createExpressApp();
    } catch (error) {
      expect(String(error)).toContain('FRONTEND_URL_LOCALHOST');
      return;
    }

    const response = await request(app)
      .options('/api/v1/conversations')
      .set('origin', 'https://untrusted.example.test')
      .set('access-control-request-method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('stops admission, waits for tracked work and drains its PostgreSQL pool', async () => {
    vi.resetModules();
    stubProductionEnvironment();
    const lifecyclePool = createIntegrationPool();
    const auditPool = createIntegrationPool();
    const providers = createControlledProviders();
    const baseReleases = [deferred(), deferred(), deferred()];
    const qwenRelease = deferred();
    providers['base-1'].enqueueBlocked(baseReleases[0].promise);
    providers['base-2'].enqueueBlocked(baseReleases[1].promise);
    providers['base-3'].enqueueBlocked(baseReleases[2].promise);
    providers.consolidator.enqueueBlocked(qwenRelease.promise);
    const terminal = deferred();

    vi.doMock('../infrastructure/postgres/postgresPool.js', () => ({
      createPostgresPool: () => lifecyclePool,
    }));
    vi.doMock('../infrastructure/llm/providerRegistry.js', () => ({ providerRegistry: providers }));
    vi.doMock('../services/conversations/turnEventPublisher.js', async importOriginal => {
      const actual =
        await importOriginal<typeof import('../services/conversations/turnEventPublisher.js')>();
      return {
        ...actual,
        TurnEventPublisher: class extends actual.TurnEventPublisher {
          override publish(event: UnsequencedTurnEvent) {
            const published = super.publish(event);
            if (event.event === 'busy_update' && event.data.hasWorkInProgress === false) {
              terminal.resolve();
            }
            return published;
          }
        },
      };
    });

    let server: Server | undefined;
    try {
      await deleteOwnedConversationRequests(auditPool, [LIFECYCLE_REQUEST_ID]);
      const { startServer, stopServer } = await import('../server.js');
      server = await startServer(0);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected lifecycle TCP port');
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const accepted = await request(baseUrl).post('/api/v1/conversations').send({
        clientRequestId: LIFECYCLE_REQUEST_ID,
        prompt: 'Finish or cancel this tracked lifecycle job.',
      });
      expect(accepted.status).toBe(202);
      await Promise.all([
        providers['base-1'].waitUntilCalled(),
        providers['base-2'].waitUntilCalled(),
        providers['base-3'].waitUntilCalled(),
      ]);

      let stopped = false;
      const admissionClosed = new Promise<void>(resolve => {
        server!.once('close', () => resolve());
      });
      const stopping = stopServer(server).then(() => {
        stopped = true;
      });
      await admissionClosed;
      await expect(request(baseUrl).get('/api/v1/conversations')).rejects.toThrow();
      expect(stopped).toBe(false);

      baseReleases.forEach(({ resolve }) => resolve());
      await providers.consolidator.waitUntilCalled();
      qwenRelease.resolve();
      await terminal.promise;
      await stopping;

      const persisted = await auditPool.query<{ active: number }>(
        `SELECT count(*)::int AS active
           FROM model_responses mr
           JOIN turns t ON t.id = mr.turn_id
           JOIN conversations c ON c.id = t.conversation_id
          WHERE c.create_client_request_id = $1
            AND mr.status IN ('pending', 'running')`,
        [LIFECYCLE_REQUEST_ID]
      );
      expect(persisted.rows[0].active).toBe(0);
      expect(server.listening).toBe(false);
      await expect(lifecyclePool.query('SELECT 1')).rejects.toThrow(/end|closed/i);
    } finally {
      baseReleases.forEach(({ resolve }) => resolve());
      qwenRelease.resolve();
      if (server?.listening) {
        const { stopServer } = await import('../server.js');
        await stopServer(server);
      }
      await deleteOwnedConversationRequests(auditPool, [LIFECYCLE_REQUEST_ID]);
      await auditPool.end();
      if (!(lifecyclePool as Pool & { ended: boolean }).ended) await lifecyclePool.end();
      vi.doUnmock('../infrastructure/postgres/postgresPool.js');
      vi.doUnmock('../infrastructure/llm/providerRegistry.js');
      vi.doUnmock('../services/conversations/turnEventPublisher.js');
      vi.resetModules();
    }
  });

  it('closes the owned pool before rejecting when startup recovery fails', async () => {
    vi.resetModules();
    stubProductionEnvironment();
    vi.stubEnv('POSTGRES_IDLE_TIMEOUT', '0');
    const recoveryStarted = deferred();
    const poolEndStarted = deferred();
    const allowPoolEnd = deferred();
    const recoveryError = new Error('controlled recovery failure');
    const pool = {
      end: vi.fn(async () => {
        poolEndStarted.resolve();
        await allowPoolEnd.promise;
      }),
    } as unknown as Pool;

    vi.doMock('../infrastructure/postgres/postgresPool.js', () => ({
      createPostgresPool: (environment: { POSTGRES_IDLE_TIMEOUT: number }) => {
        expect(environment.POSTGRES_IDLE_TIMEOUT).toBe(0);
        return pool;
      },
    }));
    vi.doMock('../infrastructure/llm/providerRegistry.js', () => ({
      providerRegistry: createControlledProviders(),
    }));
    vi.doMock('../services/conversations/recoverInterruptedTurns.js', () => ({
      recoverInterruptedTurns: vi.fn(async () => {
        recoveryStarted.resolve();
        throw recoveryError;
      }),
    }));

    const { startServer } = await import('../server.js');
    const settled = vi.fn();
    const starting = startServer(0).then(
      () => {
        settled();
        return { kind: 'resolved' as const, error: undefined };
      },
      error => {
        settled();
        return { kind: 'rejected' as const, error };
      }
    );

    try {
      await recoveryStarted.promise;
      await poolEndStarted.promise;

      expect(pool.end).toHaveBeenCalledOnce();
      expect(settled).not.toHaveBeenCalled();

      allowPoolEnd.resolve();
      expect(await starting).toEqual({ kind: 'rejected', error: recoveryError });
    } finally {
      allowPoolEnd.resolve();
      await starting;
      vi.doUnmock('../infrastructure/postgres/postgresPool.js');
      vi.doUnmock('../infrastructure/llm/providerRegistry.js');
      vi.doUnmock('../services/conversations/recoverInterruptedTurns.js');
      vi.resetModules();
    }
  });

  it('rejects an invalid startup port before creating resources or listening', async () => {
    vi.resetModules();
    stubProductionEnvironment();
    const createPool = vi.fn();
    const recoverInterruptedTurns = vi.fn();
    const pool = {
      end: vi.fn(),
    } as unknown as Pool;
    const listenSpy = vi.spyOn(Server.prototype, 'listen');

    vi.doMock('../infrastructure/postgres/postgresPool.js', () => ({
      createPostgresPool: createPool.mockReturnValue(pool),
    }));
    vi.doMock('../infrastructure/llm/providerRegistry.js', () => ({
      providerRegistry: createControlledProviders(),
    }));
    vi.doMock('../services/conversations/recoverInterruptedTurns.js', () => ({
      recoverInterruptedTurns,
    }));

    const { startServer } = await import('../server.js');

    try {
      await expect(startServer(-1)).rejects.toEqual(
        new Error('Invalid server configuration: PORT')
      );
      expect(createPool).not.toHaveBeenCalled();
      expect(recoverInterruptedTurns).not.toHaveBeenCalled();
      expect(listenSpy).not.toHaveBeenCalled();
      expect(pool.end).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../infrastructure/postgres/postgresPool.js');
      vi.doUnmock('../infrastructure/llm/providerRegistry.js');
      vi.doUnmock('../services/conversations/recoverInterruptedTurns.js');
      vi.resetModules();
    }
  });
});

function stubProductionEnvironment(): void {
  const values = {
    NODE_ENV: 'production',
    PORT: '0',
    FRONTEND_URL_LOCALHOST: 'https://frontend.example.test',
    FRONTEND_URL: 'https://frontend.example.test',
    REQUEST_MAX_BODY_SIZE: '1mb',
    REQUEST_TIMEOUT: '15s',
    POSTGRES_USER: 'integration',
    POSTGRES_PASSWORD: 'integration',
    POSTGRES_DB: 'modelfuse_test',
    POSTGRES_MAX_CONNECTIONS: '4',
    POSTGRES_IDLE_TIMEOUT: '1000',
    POSTGRES_CONNECTION_TIMEOUT: '1000',
    POSTGRES_KEEP_ALIVE: 'false',
    OPENAI_API_KEY: 'controlled',
    OPENAI_MODEL: 'controlled',
    GOOGLE_API_KEY: 'controlled',
    GOOGLE_MODEL: 'controlled',
    MINIMAX_API_KEY: 'controlled',
    MINIMAX_MODEL: 'controlled',
    QWEN_API_KEY: 'controlled',
    QWEN_MODEL: 'controlled',
    LLM_PROVIDER_TIMEOUT_MS: '30000',
    CONVERSATION_CONTEXT_MAX_TURNS: '8',
    LLM_CONTEXT_THRESHOLD_RATIO: '0.8',
    OPENAI_CONTEXT_LIMIT_TOKENS: '128000',
    GOOGLE_CONTEXT_LIMIT_TOKENS: '1000000',
    MINIMAX_CONTEXT_LIMIT_TOKENS: '1000000',
    QWEN_CONTEXT_LIMIT_TOKENS: '131072',
    CONVERSATION_SIDEBAR_PAGE_SIZE: '20',
  } as const;
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}
