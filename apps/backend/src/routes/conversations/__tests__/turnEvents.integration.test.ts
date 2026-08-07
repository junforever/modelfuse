import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelResponse, ResponseSlot } from '../../../types/conversations.js';
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

const CONVERSATION_ID = '20000000-0000-4000-8000-000000000041';
const OTHER_CONVERSATION_ID = '20000000-0000-4000-8000-000000000042';
const TURN_ID = '30000000-0000-4000-8000-000000000041';
const OTHER_TURN_ID = '30000000-0000-4000-8000-000000000042';
const UPDATED_AT = '2026-08-07T10:00:00.000Z';

describe('turn SSE protocol/PostgreSQL', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID, OTHER_CONVERSATION_ID]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deleteOwnedConversations(pool, [CONVERSATION_ID, OTHER_CONVERSATION_ID]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('validates ownership, emits the six-event persisted snapshot with SSE headers and closes terminal streams', async () => {
    await seedTurn(pool, CONVERSATION_ID, TURN_ID, 'completed');
    await seedTurn(pool, OTHER_CONVERSATION_ID, OTHER_TURN_ID, 'completed');
    const backend = createIntegrationBackend(pool, createControlledProviders());
    const unsubscribe = observeUnsubscribe(backend.publisher);

    const mismatch = await request(backend.app).get(
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${OTHER_TURN_ID}/events`
    );
    expect(mismatch.status).toBe(404);
    expect(mismatch.body.code).toBe('TURN_NOT_FOUND');

    const stream = await openSse(
      backend.app,
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${TURN_ID}/events`
    );
    try {
      expect(stream.response.status).toBe(200);
      expect(stream.response.headers.get('content-type')).toMatch(/^text\/event-stream/);
      expect(stream.response.headers.get('cache-control')).toContain('no-cache');
      expect(stream.response.headers.get('connection')).toBe('keep-alive');

      const events = await readUntilClosed(stream.nextEvent);
      expect(events.map(({ event }) => event)).toEqual([
        'slot_update',
        'slot_update',
        'slot_update',
        'slot_update',
        'turn_update',
        'busy_update',
      ]);
      expect(events.every(({ data }) => Number.isSafeInteger(data.eventSequence))).toBe(true);
      expect(events.at(-1)?.data).toMatchObject({
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        hasWorkInProgress: false,
      });

      const slotEvents = events.filter(({ event }) => event === 'slot_update');
      expect(slotEvents).toHaveLength(4);
      expect(slotEvents.map(({ data }) => (data.response as ModelResponse).content)).toEqual([
        'Final openai response',
        'Final google response',
        'Final minimax response',
        'Final qwen response',
      ]);
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      await stream.close();
    }
  });

  it('publishes complete normalized results only after their PostgreSQL commits and drains through terminal close', async () => {
    await seedTurn(pool, CONVERSATION_ID, TURN_ID, 'pending');
    const providers = createControlledProviders();
    const backend = createIntegrationBackend(pool, providers);
    const stream = await openSse(
      backend.app,
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${TURN_ID}/events`
    );

    try {
      const snapshot = await readEvents(stream.nextEvent, 6);
      const execution = backend.orchestrator.executeTurn({
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        prompt: 'Stream committed responses.',
        signal: new AbortController().signal,
      });
      const live = await readUntilClosed(stream.nextEvent);
      await execution;

      const snapshotLastSequence = Math.max(
        ...snapshot.map(({ data }) => Number(data.eventSequence))
      );
      const liveSequences = live.map(({ data }) => Number(data.eventSequence));
      expect(liveSequences).toEqual([...liveSequences].sort((a, b) => a - b));
      expect(new Set(liveSequences).size).toBe(liveSequences.length);
      expect(liveSequences.every(sequence => sequence > snapshotLastSequence)).toBe(true);
      expect(live.some(({ event }) => event === 'slot_update')).toBe(true);
      expect(live.some(({ event }) => event === 'turn_update')).toBe(true);
      expect(live.some(({ event }) => event === 'busy_update')).toBe(true);

      for (const event of live) {
        if (event.event !== 'slot_update') continue;
        const response = event.data.response as ModelResponse;
        if (response.status !== 'completed') {
          expect(response.content).toBeNull();
          continue;
        }
        expect(response.content).toBe(`Deterministic ${response.slot} response`);
        const persisted = await pool.query<{ content: string; status: string; attempt_no: number }>(
          `SELECT content, status, attempt_no FROM model_responses
            WHERE turn_id = $1 AND slot = $2`,
          [TURN_ID, response.slot]
        );
        expect(persisted.rows[0]).toMatchObject({
          content: response.content,
          status: 'completed',
          attempt_no: response.attemptNo,
        });
      }
      expect(JSON.stringify(live)).not.toContain('tokenFragment');
      expect(live.at(-1)).toMatchObject({
        event: 'busy_update',
        data: { hasWorkInProgress: false },
      });
    } finally {
      await stream.close();
    }
  });

  it('discards represented buffered events but drains a same-version commit captured after the snapshot read', async () => {
    await seedTurn(pool, CONVERSATION_ID, TURN_ID, 'pending');
    const backend = createIntegrationBackend(pool, createControlledProviders());
    const serviceEntered = deferred();
    const allowRead = deferred();
    const snapshotCaptured = deferred();
    const allowReturn = deferred();
    const original = backend.conversationService.getTurnSnapshot.bind(backend.conversationService);

    vi.spyOn(backend.conversationService, 'getTurnSnapshot').mockImplementation(
      async (conversationId: string, turnId: string) => {
        serviceEntered.resolve();
        await allowRead.promise;
        const snapshot = await original(conversationId, turnId);
        snapshotCaptured.resolve();
        await allowReturn.promise;
        return snapshot;
      }
    );
    const unsubscribe = observeUnsubscribe(backend.publisher);
    const opening = openSse(
      backend.app,
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${TURN_ID}/events`
    );

    await serviceEntered.promise;
    await persistSlot(pool, 'running', null);
    const representedRunning = backend.publisher.publish(slotEvent('running', null));
    await persistSlot(pool, 'completed', 'represented final');
    const representedFinal = backend.publisher.publish(slotEvent('completed', 'represented final'));
    expect(representedFinal.data.eventSequence).toBe(representedRunning.data.eventSequence + 1);

    allowRead.resolve();
    await snapshotCaptured.promise;
    await persistSlot(pool, 'completed', 'newer same-version final');
    const bufferedNewer = backend.publisher.publish(
      slotEvent('completed', 'newer same-version final')
    );
    allowReturn.resolve();

    const stream = await opening;
    try {
      const snapshot = await readEvents(stream.nextEvent, 6);
      const drained = await stream.nextEvent();
      expect(snapshot.filter(({ event }) => event === 'slot_update')).toHaveLength(4);
      expect(drained).toMatchObject({
        event: 'slot_update',
        data: {
          eventSequence: bufferedNewer.data.eventSequence,
          response: {
            slot: 'openai',
            attemptNo: 1,
            updatedAt: UPDATED_AT,
            content: 'newer same-version final',
          },
        },
      });
      const serialized = JSON.stringify([...snapshot, drained]);
      expect(serialized.match(/represented final/g)).toHaveLength(1);
      expect(serialized.match(/newer same-version final/g)).toHaveLength(1);
    } finally {
      await stream.close();
    }
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

function observeUnsubscribe(publisher: {
  subscribe: (turnId: string, listener: (event: TurnEvent) => void) => () => void;
}) {
  const unsubscribed = vi.fn();
  const subscribe = publisher.subscribe.bind(publisher);
  vi.spyOn(publisher, 'subscribe').mockImplementation((turnId, listener) => {
    const unsubscribe = subscribe(turnId, listener);
    return () => {
      unsubscribe();
      unsubscribed();
    };
  });
  return unsubscribed;
}

async function readEvents(
  nextEvent: () => Promise<{ event: string; data: Record<string, unknown> } | null>,
  count: number
) {
  const events = [];
  while (events.length < count) {
    const event = await nextEvent();
    if (!event) throw new Error(`SSE closed after ${events.length}/${count} expected events`);
    events.push(event);
  }
  return events;
}

async function readUntilClosed(
  nextEvent: () => Promise<{ event: string; data: Record<string, unknown> } | null>
) {
  const events = [];
  for (let index = 0; index < 64; index += 1) {
    const event = await nextEvent();
    if (!event) return events;
    events.push(event);
  }
  throw new Error('SSE did not close after the bounded terminal event set');
}

function slotEvent(status: 'running' | 'completed', content: string | null) {
  return {
    event: 'slot_update' as const,
    data: {
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      response: response('openai', status, content),
    },
  };
}

function response(
  slot: ResponseSlot,
  status: 'pending' | 'running' | 'completed',
  content: string | null
): ModelResponse {
  return {
    slot,
    role: slot === 'qwen' ? 'consolidator' : 'base',
    provider: `${slot}-fake`,
    model: `${slot}-test-model`,
    status,
    content,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: status === 'pending' ? null : UPDATED_AT,
    completedAt: status === 'completed' ? UPDATED_AT : null,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  };
}

async function seedTurn(
  pool: Pool,
  conversationId: string,
  turnId: string,
  status: 'pending' | 'completed'
): Promise<void> {
  const clientRequestId =
    conversationId === CONVERSATION_ID
      ? '10000000-0000-4000-8000-000000000141'
      : '10000000-0000-4000-8000-000000000142';
  const turnClientRequestId =
    conversationId === CONVERSATION_ID
      ? '40000000-0000-4000-8000-000000000141'
      : '40000000-0000-4000-8000-000000000142';
  await pool.query(
    `INSERT INTO conversations (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, $2, 'SSE integration', $3, $3)`,
    [conversationId, clientRequestId, UPDATED_AT]
  );
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'SSE prompt', $4, $5, $5)`,
    [turnId, conversationId, turnClientRequestId, status, UPDATED_AT]
  );
  for (const slot of ['openai', 'google', 'minimax', 'qwen'] as const) {
    const completed = status === 'completed';
    await pool.query(
      `INSERT INTO model_responses
         (id, turn_id, slot, role, provider, model, status, content, error_recoverable,
          is_stale, attempt_no, started_at, completed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, false,
               false, $8, $9, $9, $9, $9)`,
      [
        turnId,
        slot,
        slot === 'qwen' ? 'consolidator' : 'base',
        `${slot}-fake`,
        `${slot}-test-model`,
        completed ? 'completed' : 'pending',
        completed ? `Final ${slot} response` : null,
        completed ? 1 : 0,
        completed ? UPDATED_AT : null,
      ]
    );
  }
}

async function persistSlot(pool: Pool, status: 'running' | 'completed', content: string | null) {
  await pool.query(
    `UPDATE model_responses
        SET status = $1, content = $2, attempt_no = 1, started_at = $3,
            completed_at = CASE WHEN $1 = 'completed' THEN $3::timestamptz ELSE NULL END,
            updated_at = $3
      WHERE turn_id = $4 AND slot = 'openai'`,
    [status, content, UPDATED_AT, TURN_ID]
  );
}
