import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TurnEvent } from '../../../types/sse.js';
import {
  createControlledProviders,
  deferred,
} from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  TEST_DEPLOYMENT_ASSIGNMENT,
  TEST_DEPLOYMENT_DEFINITIONS,
} from '../../../test/integration/conversationDeploymentFixtures.js';
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
    providers['base-1'].enqueueError({
      code: 'timeout',
      safeMessage: 'The deterministic OpenAI provider timed out.',
      provider: providers['base-1'].provider,
      model: providers['base-1'].model,
      recoverable: true,
    });
    providers['base-2'].enqueueBlocked(baseGates[0]!.promise);
    providers['base-3'].enqueueBlocked(baseGates[1]!.promise);
    providers.consolidator.enqueueResult('Qwen partial response');

    const backend = createIntegrationBackend(pool, providers, TEST_DEPLOYMENT_DEFINITIONS);
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
        deploymentIds: TEST_DEPLOYMENT_ASSIGNMENT,
      });
      expect(created.status).toBe(201);
      ownedConversationId = created.body.conversation.id as string;
      const turnId = created.body.turn.id as string;

      stream = await openSse(
        backend.app,
        `/api/v1/conversations/${ownedConversationId}/turns/${turnId}/events`
      );
      await Promise.all([
        providers['base-2'].waitUntilCalled(),
        providers['base-3'].waitUntilCalled(),
      ]);
      baseGates.forEach(({ resolve }) => resolve());
      await providers.consolidator.waitUntilCalled();

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
              slot: 'base-1',
              status: 'failed',
              recoverable: true,
            }),
          }),
        })
      );
      expect(initialEvents).toContainEqual(
        expect.objectContaining({
          event: 'slot_update',
          data: expect.objectContaining({
            response: expect.objectContaining({
              slot: 'consolidator',
              status: 'completed',
              content: 'Qwen partial response',
            }),
          }),
        })
      );
      expect(initialEvents).toContainEqual(
        expect.objectContaining({
          event: 'turn_update',
          data: expect.objectContaining({ turn: expect.objectContaining({ status: 'partial' }) }),
        })
      );
      expect(unsubscribeCounts.active).toBe(0);
      expect(unsubscribeCounts.total).toBe(1);

      const initialState = await readTurnState(pool, turnId);
      expect(initialState).toMatchObject({
        turnStatus: 'partial',
        hasWorkInProgress: false,
        base1Status: 'failed',
        base1Recoverable: true,
        consolidatorStatus: 'completed',
        consolidatorContent: 'Qwen partial response',
        consolidatorAttempt: 1,
      });

      providers['base-1'].enqueueResult('OpenAI recovered response');
      providers.consolidator.enqueueResult('Qwen reconsolidated response');
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
        `/api/v1/conversations/${ownedConversationId}/turns/${turnId}/responses/base-1/retry`
      );
      expect(retried.status).toBe(202);
      await terminalPromise;

      const finalState = await readTurnState(pool, turnId);
      expect(finalState).toMatchObject({
        turnStatus: 'completed',
        hasWorkInProgress: false,
        base1Status: 'completed',
        base1Recoverable: false,
        base1Content: 'OpenAI recovered response',
        base1Attempt: 2,
        consolidatorStatus: 'completed',
        consolidatorContent: 'Qwen reconsolidated response',
        consolidatorAttempt: 2,
        consolidatorStale: false,
      });
      expect(providers['base-1'].calls).toHaveLength(2);
      expect(providers.consolidator.calls).toHaveLength(2);
    } finally {
      baseGates.forEach(({ resolve }) => resolve());
      terminalSubscription?.();
      await stream?.close();
      await backend.conversationService.stop();
    }
  });
});

async function readUntilClosed(
  nextEvent: () => Promise<{ event: string; data: Record<string, unknown> } | null>
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
    base1Status: string;
    base1Recoverable: boolean | null;
    base1Content: string | null;
    base1Attempt: number;
    consolidatorStatus: string;
    consolidatorContent: string | null;
    consolidatorAttempt: number;
    consolidatorStale: boolean;
  }>(
    `SELECT t.status AS "turnStatus",
            EXISTS (
              SELECT 1 FROM model_responses active
               WHERE active.turn_id = t.id AND active.status IN ('pending', 'running')
            ) AS "hasWorkInProgress",
            base1.status AS "base1Status", base1.error_recoverable AS "base1Recoverable",
            base1.content AS "base1Content", base1.attempt_no AS "base1Attempt",
            consolidator.status AS "consolidatorStatus",
            consolidator.content AS "consolidatorContent",
            consolidator.attempt_no AS "consolidatorAttempt",
            consolidator.is_stale AS "consolidatorStale"
       FROM turns t
       JOIN model_responses base1 ON base1.turn_id = t.id AND base1.slot = 'base-1'
       JOIN model_responses consolidator
         ON consolidator.turn_id = t.id AND consolidator.slot = 'consolidator'
      WHERE t.id = $1`,
    [turnId]
  );
  return result.rows[0];
}
