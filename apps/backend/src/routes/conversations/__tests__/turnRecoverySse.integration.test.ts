import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TurnEvent } from '../../../types/sse.js';
import {
  createControlledProviders,
  deferred,
} from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import { openSse } from '../../../test/integration/sseTestClient.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
} from '../../../test/integration/testDatabase.js';

const CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000172';

describe('recoverable response and partial Qwen terminal SSE integration', () => {
  let pool: Pool;
  let ownedConversationId: string | undefined;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (ownedConversationId) {
      await deleteOwnedConversations(pool, [ownedConversationId]);
      ownedConversationId = undefined;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('converges a recoverable base plus partial Qwen to terminal state and closes the initial SSE', async () => {
    const providers = createControlledProviders();
    const baseGates = [deferred(), deferred()];
    providers.openai.enqueueError({
      code: 'timeout',
      safeMessage: 'The deterministic OpenAI provider timed out.',
      provider: providers.openai.provider,
      model: providers.openai.model,
      recoverable: true,
    });
    providers.google.enqueueBlocked(baseGates[0]!.promise);
    providers.minimax.enqueueBlocked(baseGates[1]!.promise);
    providers.qwen.enqueueResult('Qwen partial response');

    const backend = createIntegrationBackend(pool, providers);
    const unsubscribeCounts = { active: 0, total: 0 };
    const subscribe = backend.publisher.subscribe.bind(backend.publisher);
    vi.spyOn(backend.publisher, 'subscribe').mockImplementation((turnId, listener) => {
      unsubscribeCounts.active += 1;
      const unsubscribe = subscribe(turnId, listener);
      return () => {
        unsubscribeCounts.active -= 1;
        unsubscribeCounts.total += 1;
        unsubscribe();
      };
    });

    let stream: Awaited<ReturnType<typeof openSse>> | undefined;
    let terminalSubscription: (() => void) | undefined;
    let terminalPromise: Promise<void> | undefined;

    try {
      const created = await request(backend.app).post('/api/v1/conversations').send({
        clientRequestId: CLIENT_REQUEST_ID,
        prompt: 'Recover the first response and retain partial Qwen output.',
      });
      expect(created.status).toBe(202);
      ownedConversationId = created.body.conversation.id as string;
      const turnId = created.body.turn.id as string;

      stream = await openSse(
        backend.app,
        `/api/v1/conversations/${ownedConversationId}/turns/${turnId}/events`,
      );
      await Promise.all([providers.google.waitUntilCalled(), providers.minimax.waitUntilCalled()]);
      baseGates.forEach(({ resolve }) => resolve());
      await providers.qwen.waitUntilCalled();

      const initialEvents = await readUntilClosed(stream.nextEvent);
      expect(initialEvents.at(-1)).toMatchObject({
        event: 'busy_update',
        data: { hasWorkInProgress: false },
      });
      expect(initialEvents).toContainEqual(
        expect.objectContaining({
          event: 'slot_update',
          data: expect.objectContaining({
            response: expect.objectContaining({
              slot: 'openai',
              status: 'failed',
              recoverable: true,
            }),
          }),
        }),
      );
      expect(initialEvents).toContainEqual(
        expect.objectContaining({
          event: 'slot_update',
          data: expect.objectContaining({
            response: expect.objectContaining({
              slot: 'qwen',
              status: 'completed',
              content: 'Qwen partial response',
            }),
          }),
        }),
      );
      expect(initialEvents).toContainEqual(
        expect.objectContaining({
          event: 'turn_update',
          data: expect.objectContaining({ turn: expect.objectContaining({ status: 'partial' }) }),
        }),
      );
      expect(unsubscribeCounts.active).toBe(0);
      expect(unsubscribeCounts.total).toBe(1);

      const initialState = await readTurnState(pool, turnId);
      expect(initialState).toMatchObject({
        turnStatus: 'partial',
        hasWorkInProgress: false,
        openaiStatus: 'failed',
        openaiRecoverable: true,
        qwenStatus: 'completed',
        qwenContent: 'Qwen partial response',
        qwenAttempt: 1,
      });

      providers.openai.enqueueResult('OpenAI recovered response');
      providers.qwen.enqueueResult('Qwen reconsolidated response');
      terminalPromise = new Promise(resolve => {
        terminalSubscription = backend.publisher.subscribe(turnId, (event: TurnEvent) => {
          if (event.event === 'busy_update' && !event.data.hasWorkInProgress) {
            terminalSubscription?.();
            terminalSubscription = undefined;
            resolve();
          }
        });
      });

      const retried = await request(backend.app).post(
        `/api/v1/conversations/${ownedConversationId}/turns/${turnId}/responses/openai/retry`,
      );
      expect(retried.status).toBe(202);
      await terminalPromise;

      const finalState = await readTurnState(pool, turnId);
      expect(finalState).toMatchObject({
        turnStatus: 'completed',
        hasWorkInProgress: false,
        openaiStatus: 'completed',
        openaiRecoverable: false,
        openaiContent: 'OpenAI recovered response',
        openaiAttempt: 2,
        qwenStatus: 'completed',
        qwenContent: 'Qwen reconsolidated response',
        qwenAttempt: 2,
        qwenStale: false,
      });
      expect(providers.openai.calls).toHaveLength(2);
      expect(providers.qwen.calls).toHaveLength(2);
    } finally {
      baseGates.forEach(({ resolve }) => resolve());
      terminalSubscription?.();
      await stream?.close();
      await backend.conversationService.stop();
    }
  });
});

async function readUntilClosed(
  nextEvent: () => Promise<{ event: string; data: Record<string, unknown> } | null>,
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (let index = 0; index < 64; index += 1) {
    const event = await nextEvent();
    if (!event) return events;
    events.push(event);
  }
  throw new Error('SSE did not close after the bounded terminal event set');
}

async function readTurnState(pool: Pool, turnId: string) {
  const result = await pool.query<{
    turnStatus: string;
    hasWorkInProgress: boolean;
    openaiStatus: string;
    openaiRecoverable: boolean | null;
    openaiContent: string | null;
    openaiAttempt: number;
    qwenStatus: string;
    qwenContent: string | null;
    qwenAttempt: number;
    qwenStale: boolean;
  }>(
    `SELECT t.status AS "turnStatus",
            EXISTS (
              SELECT 1 FROM model_responses active
               WHERE active.turn_id = t.id AND active.status IN ('pending', 'running')
            ) AS "hasWorkInProgress",
            openai.status AS "openaiStatus", openai.error_recoverable AS "openaiRecoverable",
            openai.content AS "openaiContent", openai.attempt_no AS "openaiAttempt",
            qwen.status AS "qwenStatus", qwen.content AS "qwenContent",
            qwen.attempt_no AS "qwenAttempt", qwen.is_stale AS "qwenStale"
       FROM turns t
       JOIN model_responses openai ON openai.turn_id = t.id AND openai.slot = 'openai'
       JOIN model_responses qwen ON qwen.turn_id = t.id AND qwen.slot = 'qwen'
      WHERE t.id = $1`,
    [turnId],
  );
  return result.rows[0];
}
