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
const CONCURRENT_UPDATED_AT = '2026-08-07T10:00:01.000Z';

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

  it('keeps the PostgreSQL snapshot coherent when a commit lands between its reads and drains that commit', async () => {
    await seedTurn(pool, CONVERSATION_ID, TURN_ID, 'pending');
    let subscribed = false;
    const snapshotRead = gateSnapshotConversationRead(pool, () => subscribed);
    const backend = createIntegrationBackend(snapshotRead.pool, createControlledProviders());
    const unsubscribe = observeUnsubscribe(backend.publisher, () => {
      subscribed = true;
    });
    const opening = openSse(
      backend.app,
      `/api/v1/conversations/${CONVERSATION_ID}/turns/${TURN_ID}/events`
    );

    await snapshotRead.entered;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE model_responses
            SET status = 'completed', content = 'Concurrent ' || slot, attempt_no = 1,
                started_at = $1, completed_at = $1, updated_at = $1
          WHERE turn_id = $2`,
        [CONCURRENT_UPDATED_AT, TURN_ID]
      );
      await client.query(`UPDATE turns SET status = 'completed', updated_at = $1 WHERE id = $2`, [
        CONCURRENT_UPDATED_AT,
        TURN_ID,
      ]);
      await client.query(`UPDATE conversations SET updated_at = $1 WHERE id = $2`, [
        CONCURRENT_UPDATED_AT,
        CONVERSATION_ID,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    for (const slot of ['openai', 'google', 'minimax', 'qwen'] as const) {
      backend.publisher.publish({
        event: 'slot_update',
        data: {
          conversationId: CONVERSATION_ID,
          turnId: TURN_ID,
          response: response(slot, 'completed', `Concurrent ${slot}`, CONCURRENT_UPDATED_AT),
        },
      });
    }
    backend.publisher.publish({
      event: 'turn_update',
      data: {
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        turn: { id: TURN_ID, status: 'completed', updatedAt: CONCURRENT_UPDATED_AT },
      },
    });
    backend.publisher.publish({
      event: 'busy_update',
      data: {
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        hasWorkInProgress: false,
        updatedAt: CONCURRENT_UPDATED_AT,
      },
    });
    snapshotRead.release();

    const stream = await opening;
    try {
      const snapshot = await readEvents(stream.nextEvent, 6);
      const drained = await readUntilClosed(stream.nextEvent);
      expect(snapshot.map(({ data }) => data.eventSequence)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(snapshot.at(-1)).toMatchObject({
        event: 'busy_update',
        data: { hasWorkInProgress: true },
      });
      expect(
        snapshot
          .filter(({ event }) => event === 'slot_update')
          .every(({ data }) => (data.response as ModelResponse).status === 'pending')
      ).toBe(true);
      expect(drained.map(({ event }) => event)).toEqual([
        'slot_update',
        'slot_update',
        'slot_update',
        'slot_update',
        'turn_update',
        'busy_update',
      ]);
      expect(drained.map(({ data }) => data.eventSequence)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(drained.at(-1)).toMatchObject({
        event: 'busy_update',
        data: { hasWorkInProgress: false },
      });
    } finally {
      snapshotRead.release();
      await stream.close();
    }
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

function observeUnsubscribe(
  publisher: {
    subscribe: (turnId: string, listener: (event: TurnEvent) => void) => () => void;
  },
  onSubscribe?: () => void
) {
  const unsubscribed = vi.fn();
  const subscribe = publisher.subscribe.bind(publisher);
  vi.spyOn(publisher, 'subscribe').mockImplementation((turnId, listener) => {
    onSubscribe?.();
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

function response(
  slot: ResponseSlot,
  status: 'pending' | 'running' | 'completed',
  content: string | null,
  updatedAt = UPDATED_AT
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
    startedAt: status === 'pending' ? null : updatedAt,
    completedAt: status === 'completed' ? updatedAt : null,
    createdAt: UPDATED_AT,
    updatedAt,
  };
}

function gateSnapshotConversationRead(pool: Pool, isSubscribed: () => boolean) {
  const entered = deferred();
  const release = deferred();
  let gated = false;
  type Query = (...args: unknown[]) => Promise<unknown>;

  const wrapQuery =
    (query: Query): Query =>
    async (...args) => {
      const result = await query(...args);
      const config = args[0];
      const text =
        typeof config === 'string'
          ? config
          : typeof config === 'object' && config !== null && 'text' in config
            ? String(config.text)
            : '';
      if (!gated && isSubscribed() && /^\s*SELECT\b/i.test(text)) {
        gated = true;
        entered.resolve();
        await release.promise;
      }
      return result;
    };

  const guardedPool = new Proxy(pool, {
    get(target, property) {
      if (property === 'query') return wrapQuery(target.query.bind(target) as Query);
      if (property === 'connect') {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(clientTarget, clientProperty) {
              if (clientProperty === 'query') {
                return wrapQuery(clientTarget.query.bind(clientTarget) as Query);
              }
              const value = Reflect.get(clientTarget, clientProperty, clientTarget) as unknown;
              return typeof value === 'function'
                ? (value as (...args: unknown[]) => unknown).bind(clientTarget)
                : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  return { pool: guardedPool, entered: entered.promise, release: release.resolve };
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
               false, $8, $9, $9, $10, $10)`,
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
        UPDATED_AT,
      ]
    );
  }
}
