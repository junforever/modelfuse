import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TurnEvent } from '../../../types/sse.js';
import {
  createControlledProviders,
  deferred,
} from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
  dropIntegrationSchema,
} from '../../../test/integration/testDatabase.js';

const CONVERSATION_ID = '20000000-0000-4000-8000-000000000043';
const TURN_ID = '30000000-0000-4000-8000-000000000043';
const OTHER_TURN_ID = '30000000-0000-4000-8000-000000000044';
const NOW = '2026-08-07T11:00:00.000Z';

describe('retry and Continue-without REST/PostgreSQL', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool({ schema: 'response_actions' });
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
  });

  afterAll(async () => {
    await dropIntegrationSchema(pool);
    await pool?.end();
  });

  it('accepts one concurrent retry by CAS, increments attempt_no and reconsolidates only after base success', async () => {
    await seedFailedTurn(pool, { slot: 'openai', recoverable: true });
    const providers = createControlledProviders();
    const release = deferred();
    const releaseQwen = deferred();
    providers.openai.enqueueBlocked(release.promise, 'Recovered OpenAI answer');
    providers.qwen.enqueueBlocked(releaseQwen.promise, 'Re-consolidated answer');
    const backend = createIntegrationBackend(pool, providers);
    const path = actionPath('openai', 'retry');
    const events: TurnEvent[] = [];
    const unsubscribe = backend.publisher.subscribe(TURN_ID, event => events.push(event));

    try {
      const [one, two] = await Promise.all([
        request(backend.app).post(path),
        request(backend.app).post(path),
      ]);
      const accepted = [one, two].find(({ status }) => status === 202);
      const rejected = [one, two].find(({ status }) => status === 409);
      expect(accepted).toBeDefined();
      expect(rejected?.body.code).toBe('RESPONSE_RETRY_IN_PROGRESS');

      const active = await pool.query<{ status: string; attempt_no: number }>(
        `SELECT status, attempt_no FROM model_responses
          WHERE turn_id = $1 AND slot = 'openai'`,
        [TURN_ID]
      );
      expect(active.rows[0]).toMatchObject({ attempt_no: 2 });
      expect(['pending', 'running']).toContain(active.rows[0].status);

      const idle = waitForIdle(backend.publisher, TURN_ID);
      release.resolve();
      const qwenStarted = await Promise.race([
        providers.qwen.waitUntilCalled().then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 2_000)),
      ]);

      const qwenPending = events.findIndex(
        event =>
          event.event === 'slot_update' &&
          event.data.response.slot === 'qwen' &&
          event.data.response.status === 'pending' &&
          event.data.response.isStale === true
      );
      const qwenRunning = events.findIndex(
        event =>
          event.event === 'slot_update' &&
          event.data.response.slot === 'qwen' &&
          event.data.response.status === 'running'
      );
      expect(qwenPending).toBeGreaterThanOrEqual(0);
      expect(qwenRunning).toBeGreaterThan(qwenPending);
      expect(qwenStarted).toBe(true);

      releaseQwen.resolve();
      await idle;

      const final = await pool.query<{
        slot: string;
        status: string;
        content: string;
        attempt_no: number;
        is_stale: boolean;
      }>(
        `SELECT slot, status, content, attempt_no, is_stale
           FROM model_responses
          WHERE turn_id = $1 AND slot IN ('openai', 'qwen')
          ORDER BY slot`,
        [TURN_ID]
      );
      expect(final.rows).toEqual([
        {
          slot: 'openai',
          status: 'completed',
          content: 'Recovered OpenAI answer',
          attempt_no: 2,
          is_stale: false,
        },
        {
          slot: 'qwen',
          status: 'completed',
          content: 'Re-consolidated answer',
          attempt_no: 2,
          is_stale: false,
        },
      ]);
      expect(providers.openai.calls).toHaveLength(1);
      expect(providers.qwen.calls).toHaveLength(1);
      expect(providers.google.calls).toHaveLength(0);
      expect(providers.minimax.calls).toHaveLength(0);
    } finally {
      unsubscribe();
      release.resolve();
      releaseQwen.resolve();
    }
  });

  it('returns the three distinct 409 retry guards from committed state', async () => {
    const providers = createControlledProviders();

    await seedFailedTurn(pool, { slot: 'openai', recoverable: true, otherTurnBusy: true });
    let backend = createIntegrationBackend(pool, providers);
    const busy = await request(backend.app).post(actionPath('openai', 'retry'));
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('CONVERSATION_BUSY');

    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
    await seedFailedTurn(pool, { slot: 'openai', recoverable: true, responseActive: true });
    backend = createIntegrationBackend(pool, providers);
    const active = await request(backend.app).post(actionPath('openai', 'retry'));
    expect(active.status).toBe(409);
    expect(active.body.code).toBe('RESPONSE_RETRY_IN_PROGRESS');

    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
    await seedFailedTurn(pool, { slot: 'openai', recoverable: false });
    backend = createIntegrationBackend(pool, providers);
    const ineligible = await request(backend.app).post(actionPath('openai', 'retry'));
    expect(ineligible.status).toBe(409);
    expect(ineligible.body.code).toBe('RESPONSE_NOT_RETRYABLE');
  });

  it('persists Continue-without and rejects a later retry without mutation or provider calls', async () => {
    await seedFailedTurn(pool, { slot: 'minimax', recoverable: true });
    const providers = createControlledProviders();
    const backend = createIntegrationBackend(pool, providers);

    const continued = await request(backend.app).post(actionPath('minimax', 'continue-without'));
    expect(continued.status).toBe(200);
    expect(continued.body.turn.responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slot: 'minimax',
          status: 'failed',
          recoverable: true,
          continuedWithout: true,
        }),
      ])
    );

    const persisted = await pool.query<{
      status: string;
      error_recoverable: boolean;
      continued_without_at: Date | null;
    }>(
      `SELECT status, error_recoverable, continued_without_at
         FROM model_responses WHERE turn_id = $1 AND slot = 'minimax'`,
      [TURN_ID]
    );
    expect(persisted.rows[0]).toMatchObject({ status: 'failed', error_recoverable: true });
    expect(persisted.rows[0].continued_without_at).toBeInstanceOf(Date);

    const stateBeforeRetry = await readPersistedActionState(pool);
    const providerCallsBeforeRetry = Object.values(providers).flatMap(({ calls }) => calls);
    expect(providerCallsBeforeRetry).toHaveLength(0);

    const retry = await request(backend.app).post(actionPath('minimax', 'retry'));
    expect(retry.status).toBe(409);
    expect(retry.body).toEqual({
      code: 'RESPONSE_NOT_RETRYABLE',
      message: 'The response is not retryable.',
      requestId: expect.any(String),
    });
    expect(await readPersistedActionState(pool)).toEqual(stateBeforeRetry);
    expect(Object.values(providers).flatMap(({ calls }) => calls)).toHaveLength(
      providerCallsBeforeRetry.length
    );
  });
});

function actionPath(slot: string, action: 'retry' | 'continue-without') {
  return `/api/v1/conversations/${CONVERSATION_ID}/turns/${TURN_ID}/responses/${slot}/${action}`;
}

function waitForIdle(
  publisher: { subscribe: (turnId: string, listener: (event: TurnEvent) => void) => () => void },
  turnId: string
): Promise<void> {
  return new Promise(resolve => {
    const unsubscribe = publisher.subscribe(turnId, event => {
      if (event.event === 'busy_update' && event.data.hasWorkInProgress === false) {
        unsubscribe();
        resolve();
      }
    });
  });
}

async function readPersistedActionState(pool: Pool): Promise<Record<string, unknown>[]> {
  const state = await pool.query<Record<string, unknown>>(
    `SELECT mr.slot, mr.status, mr.content, mr.error_code, mr.error_message,
            mr.error_recoverable, mr.continued_without_at, mr.attempt_no,
            mr.started_at, mr.completed_at, mr.updated_at,
            t.status AS turn_status, t.updated_at AS turn_updated_at,
            c.updated_at AS conversation_updated_at
       FROM model_responses mr
       JOIN turns t ON t.id = mr.turn_id
       JOIN conversations c ON c.id = t.conversation_id
      WHERE mr.turn_id = $1
      ORDER BY mr.slot`,
    [TURN_ID]
  );
  return state.rows;
}

async function seedFailedTurn(
  pool: Pool,
  options: {
    slot: 'openai' | 'google' | 'minimax';
    recoverable: boolean;
    otherTurnBusy?: boolean;
    responseActive?: boolean;
  }
): Promise<void> {
  const turnStatus = options.responseActive ? 'running' : 'partial';
  await pool.query(
    `INSERT INTO conversations (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, '10000000-0000-4000-8000-000000000243', 'Retry integration', $2, $2)`,
    [CONVERSATION_ID, NOW]
  );
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, '40000000-0000-4000-8000-000000000043', 1, 'Retry prompt', $3, $4, $4)`,
    [TURN_ID, CONVERSATION_ID, turnStatus, NOW]
  );

  for (const slot of ['openai', 'google', 'minimax', 'qwen'] as const) {
    const selected = slot === options.slot;
    const active = selected && options.responseActive;
    const status = active ? 'running' : selected ? 'failed' : 'completed';
    const content = selected ? null : `Original ${slot} response`;
    await pool.query(
      `INSERT INTO model_responses
         (id, turn_id, slot, role, provider, model, status, content, error_code,
          error_message, error_recoverable, is_stale, attempt_no, started_at,
          completed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               false, 1, $11, $12, $13, $13)`,
      [
        TURN_ID,
        slot,
        slot === 'qwen' ? 'consolidator' : 'base',
        `${slot}-fake`,
        `${slot}-test-model`,
        status,
        content,
        status === 'failed' ? 'timeout' : null,
        status === 'failed' ? 'Safe provider timeout' : null,
        status === 'failed' ? options.recoverable : false,
        active || status === 'completed' ? NOW : null,
        status === 'completed' ? NOW : null,
        NOW,
      ]
    );
  }

  if (options.otherTurnBusy) {
    await pool.query(
      `INSERT INTO turns
         (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
       VALUES ($1, $2, '40000000-0000-4000-8000-000000000044', 2, 'Other active prompt', 'pending', $3, $3)`,
      [OTHER_TURN_ID, CONVERSATION_ID, NOW]
    );
  }
}
