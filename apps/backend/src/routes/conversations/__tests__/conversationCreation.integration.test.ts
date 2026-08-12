import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createControlledProviders,
  deferred,
} from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversationRequests,
  deleteOwnedConversations,
} from '../../../test/integration/testDatabase.js';

const CREATE_IDS = [
  '10000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000041',
  '10000000-0000-4000-8000-000000000042',
  '10000000-0000-4000-8000-000000000043',
  '10000000-0000-4000-8000-000000000044',
  '10000000-0000-4000-8000-000000000045',
] as const;
const SEEDED_CONVERSATION_ID = '20000000-0000-4000-8000-000000000040';
const SEEDED_TURN_ID = '30000000-0000-4000-8000-000000000040';

describe('conversation creation REST/PostgreSQL', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversationRequests(pool, CREATE_IDS);
    await deleteOwnedConversations(pool, [SEEDED_CONVERSATION_ID]);
  });

  afterEach(async () => {
    await deleteOwnedConversationRequests(pool, CREATE_IDS);
    await deleteOwnedConversations(pool, [SEEDED_CONVERSATION_ID]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('returns 202 only after atomically committing one conversation, one turn and four slots', async () => {
    const providers = createControlledProviders();
    const releases = [deferred(), deferred(), deferred()];
    providers.openai.enqueueBlocked(releases[0].promise);
    providers.google.enqueueBlocked(releases[1].promise);
    providers.minimax.enqueueBlocked(releases[2].promise);
    const { app, publisher } = createIntegrationBackend(pool, providers);

    try {
      const response = await request(app).post('/api/v1/conversations').send({
        clientRequestId: CREATE_IDS[0],
        prompt: 'Compare atomic persistence.',
      });

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        conversation: { id: expect.any(String), hasWorkInProgress: true },
        turn: {
          id: expect.any(String),
          clientRequestId: CREATE_IDS[0],
          prompt: 'Compare atomic persistence.',
          responses: expect.arrayContaining([
            expect.objectContaining({ slot: 'openai' }),
            expect.objectContaining({ slot: 'google' }),
            expect.objectContaining({ slot: 'minimax' }),
            expect.objectContaining({ slot: 'qwen' }),
          ]),
        },
      });

      const rows = await pool.query<{ conversations: number; turns: number; responses: number }>(
        `SELECT count(DISTINCT c.id)::int AS conversations,
                count(DISTINCT t.id)::int AS turns,
                count(mr.id)::int AS responses
           FROM conversations c
           LEFT JOIN turns t ON t.conversation_id = c.id
           LEFT JOIN model_responses mr ON mr.turn_id = t.id
          WHERE c.create_client_request_id = $1`,
        [CREATE_IDS[0]]
      );
      expect(rows.rows[0]).toEqual({ conversations: 1, turns: 1, responses: 4 });

      const idle = waitForIdle(publisher, response.body.turn.id);
      releases.forEach(({ resolve }) => resolve());
      await idle;
    } finally {
      releases.forEach(({ resolve }) => resolve());
    }
  });

  it('rolls back every row when the fourth slot insert fails inside the transaction', async () => {
    const functionName = 'it_t040_fail_fourth_slot';
    const triggerName = 'it_t040_fail_fourth_slot_trigger';
    const providers = createControlledProviders();
    const { app, publisher } = createIntegrationBackend(pool, providers);

    await pool.query(`
      CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.slot = 'qwen' AND EXISTS (
          SELECT 1 FROM turns t
          JOIN conversations c ON c.id = t.conversation_id
          WHERE t.id = NEW.turn_id AND c.create_client_request_id = '${CREATE_IDS[1]}'::uuid
        ) THEN
          RAISE EXCEPTION 'controlled integration failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER ${triggerName} BEFORE INSERT ON model_responses
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);

    try {
      const response = await request(app).post('/api/v1/conversations').send({
        clientRequestId: CREATE_IDS[1],
        prompt: 'This transaction must roll back.',
      });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        code: 'INTERNAL_ERROR',
        requestId: expect.any(String),
      });

      const persisted = await pool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM conversations WHERE create_client_request_id = $1',
        [CREATE_IDS[1]]
      );
      expect(persisted.rows[0].count).toBe(0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON model_responses`);
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  });

  it('resolves concurrent replay before busy and rejects ID/prompt conflict without duplicate work', async () => {
    await seedCompletedConversation(pool);
    const providers = createControlledProviders();
    const releases = [deferred(), deferred(), deferred()];
    providers.openai.enqueueBlocked(releases[0].promise);
    providers.google.enqueueBlocked(releases[1].promise);
    providers.minimax.enqueueBlocked(releases[2].promise);
    const { app, publisher } = createIntegrationBackend(pool, providers);
    const create = { clientRequestId: CREATE_IDS[2], prompt: 'Concurrent replay prompt.' };

    try {
      const [first, replay] = await Promise.all([
        request(app).post(`/api/v1/conversations/${SEEDED_CONVERSATION_ID}/turns`).send(create),
        request(app).post(`/api/v1/conversations/${SEEDED_CONVERSATION_ID}/turns`).send(create),
      ]);

      expect([first.status, replay.status]).toEqual([202, 202]);
      expect(replay.body.turn.id).toBe(first.body.turn.id);

      const conflict = await request(app)
        .post(`/api/v1/conversations/${SEEDED_CONVERSATION_ID}/turns`)
        .send({ ...create, prompt: 'Different prompt.' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe('CLIENT_REQUEST_ID_CONFLICT');

      const busy = await request(app)
        .post(`/api/v1/conversations/${SEEDED_CONVERSATION_ID}/turns`)
        .send({ clientRequestId: CREATE_IDS[3], prompt: 'New work while busy.' });
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe('CONVERSATION_BUSY');

      const durable = await pool.query<{ turns: number; responses: number }>(
        `SELECT count(DISTINCT t.id)::int AS turns, count(mr.id)::int AS responses
           FROM turns t LEFT JOIN model_responses mr ON mr.turn_id = t.id
          WHERE t.conversation_id = $1 AND t.client_request_id = $2`,
        [SEEDED_CONVERSATION_ID, CREATE_IDS[2]]
      );
      expect(durable.rows[0]).toEqual({ turns: 1, responses: 4 });

      await Promise.all([
        providers.openai.waitUntilCalled(),
        providers.google.waitUntilCalled(),
        providers.minimax.waitUntilCalled(),
      ]);
      expect(providers.openai.calls).toHaveLength(1);
      expect(providers.google.calls).toHaveLength(1);
      expect(providers.minimax.calls).toHaveLength(1);

      const idle = waitForIdle(publisher, first.body.turn.id);
      releases.forEach(({ resolve }) => resolve());
      await idle;
    } finally {
      releases.forEach(({ resolve }) => resolve());
    }
  });

  it('keeps exactly 80 graphemes and never splits ZWJ emoji or combining marks', async () => {
    const providers = createControlledProviders();
    const releases = Array.from({ length: 6 }, () => deferred());
    providers.openai.enqueueBlocked(releases[0].promise);
    providers.google.enqueueBlocked(releases[1].promise);
    providers.minimax.enqueueBlocked(releases[2].promise);
    providers.openai.enqueueBlocked(releases[3].promise);
    providers.google.enqueueBlocked(releases[4].promise);
    providers.minimax.enqueueBlocked(releases[5].promise);
    const { app, publisher } = createIntegrationBackend(pool, providers);
    const eighty = `${'A'.repeat(78)}👩‍💻e\u0301`;
    const eightyOne = `${eighty}Z`;

    const exact = await request(app)
      .post('/api/v1/conversations')
      .send({
        clientRequestId: CREATE_IDS[3],
        prompt: `  ${eighty}  `,
      });
    const exactIdle = waitForIdle(publisher, exact.body.turn.id);
    releases.slice(0, 3).forEach(({ resolve }) => resolve());
    await exactIdle;
    const truncated = await request(app)
      .post('/api/v1/conversations')
      .send({
        clientRequestId: CREATE_IDS[4],
        prompt: `  ${eightyOne}  `,
      });
    const truncatedIdle = waitForIdle(publisher, truncated.body.turn.id);
    releases.slice(3).forEach(({ resolve }) => resolve());
    await truncatedIdle;

    expect(exact.status).toBe(202);
    expect(truncated.status).toBe(202);
    expect(exact.body.conversation.title).toBe(eighty);
    expect(truncated.body.conversation.title).toBe(eighty);

    const titles = await pool.query<{ title: string }>(
      `SELECT title FROM conversations
        WHERE create_client_request_id = ANY($1::uuid[])
        ORDER BY create_client_request_id`,
      [[CREATE_IDS[3], CREATE_IDS[4]]]
    );
    expect(titles.rows.map(({ title }) => title)).toEqual([eighty, eighty]);
  });

  it('reconciles every active slot when an unexpected publisher failure escapes after 202', async () => {
    const providers = createControlledProviders();
    const releases = [deferred(), deferred(), deferred()];
    providers.openai.enqueueBlocked(releases[0].promise);
    providers.google.enqueueBlocked(releases[1].promise);
    providers.minimax.enqueueBlocked(releases[2].promise);
    const backend = createIntegrationBackend(pool, providers);
    const originalPublish = backend.publisher.publish.bind(backend.publisher);
    const terminal = deferred();
    let unsubscribe: () => void = () => undefined;
    let failureListenerInstalled = false;

    vi.spyOn(backend.publisher, 'publish').mockImplementation(event => {
      if (!failureListenerInstalled) {
        failureListenerInstalled = true;
        unsubscribe = backend.publisher.subscribe(event.data.turnId, () => {
          throw new Error('controlled publisher listener failure');
        });
      }
      if (event.event === 'busy_update' && event.data.hasWorkInProgress === false) {
        terminal.resolve();
      }
      return originalPublish(event);
    });

    try {
      const accepted = await request(backend.app).post('/api/v1/conversations').send({
        clientRequestId: CREATE_IDS[5],
        prompt: 'Reconcile an unexpected post-acceptance failure.',
      });
      expect(accepted.status).toBe(202);

      releases.forEach(({ resolve }) => resolve());
      const converged = await Promise.race([
        terminal.promise.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 2_000)),
      ]);

      const persisted = await pool.query<{ status: string; count: number }>(
        `SELECT status, count(*)::int AS count
           FROM model_responses
          WHERE turn_id = $1
          GROUP BY status
          ORDER BY status`,
        [accepted.body.turn.id]
      );
      const snapshot = await request(backend.app).get(
        `/api/v1/conversations/${accepted.body.conversation.id}/turns/${accepted.body.turn.id}`
      );

      expect(
        persisted.rows.filter(({ status }) => status === 'pending' || status === 'running')
      ).toEqual([]);
      expect(snapshot.status).toBe(200);
      expect(snapshot.body.conversation.hasWorkInProgress).toBe(false);
      expect(['completed', 'partial', 'failed']).toContain(snapshot.body.turn.status);
      expect(converged).toBe(true);
    } finally {
      unsubscribe();
      releases.forEach(({ resolve }) => resolve());
    }
  });
});

function waitForIdle(
  publisher: { subscribe: (turnId: string, listener: (event: any) => void) => () => void },
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

async function seedCompletedConversation(pool: Pool): Promise<void> {
  const now = '2026-01-02T03:04:05.000Z';
  await pool.query(
    `INSERT INTO conversations (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, $2, 'Seeded conversation', $3, $3)`,
    [SEEDED_CONVERSATION_ID, '10000000-0000-4000-8000-000000000099', now]
  );
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'Seed prompt', 'completed', $4, $4)`,
    [SEEDED_TURN_ID, SEEDED_CONVERSATION_ID, '40000000-0000-4000-8000-000000000040', now]
  );
  await pool.query(
    `INSERT INTO model_responses
       (id, turn_id, slot, role, provider, model, status, content, error_recoverable,
        is_stale, attempt_no, created_at, updated_at, completed_at)
     SELECT gen_random_uuid(), $1, slot,
            CASE WHEN slot = 'qwen' THEN 'consolidator' ELSE 'base' END,
            slot, slot || '-test-model', 'completed', slot || ' completed', false,
            false, 1, $2, $2, $2
       FROM unnest(ARRAY['openai','google','minimax','qwen']) AS slot`,
    [SEEDED_TURN_ID, now]
  );
}
