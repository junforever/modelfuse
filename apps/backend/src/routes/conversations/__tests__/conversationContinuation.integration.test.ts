import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createControlledProviders,
  deferred,
} from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  insertConversationDeployments,
  TEST_DEPLOYMENT_SNAPSHOTS,
  TEST_DEPLOYMENT_SUMMARIES,
} from '../../../test/integration/conversationDeploymentFixtures.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
} from '../../../test/integration/testDatabase.js';
import type { ConversationDeploymentSnapshotTuple } from '../../../types/conversations.js';

const CONVERSATION_ID = '73000000-0000-4000-8000-000000000077';
const FIRST_TURN_ID = '73100000-0000-4000-8000-000000000077';
const SECOND_REQUEST_ID = '73200000-0000-4000-8000-000000000077';
const THIRD_REQUEST_ID = '73300000-0000-4000-8000-000000000077';
const NOW = '2026-07-26T20:00:00.000Z';

describe('conversation continuation HTTP/PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
    await seedCompletedConversation(pool);
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('resolves replay before busy, assigns ordinals and accepts new work after terminal release', async () => {
    const providers = createControlledProviders();
    const gates = Array.from({ length: 6 }, () => deferred());
    for (const [index, slot] of [
      'base-1',
      'base-2',
      'base-3',
      'base-1',
      'base-2',
      'base-3',
    ].entries()) {
      providers[slot as 'base-1' | 'base-2' | 'base-3'].enqueueBlocked(gates[index]!.promise);
    }
    const { app, publisher } = createIntegrationBackend(pool, providers, []);
    const secondPayload = { clientRequestId: SECOND_REQUEST_ID, prompt: 'Segundo turno' };
    const idleObservations: IdleObservation[] = [];

    try {
      const created = await request(app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send(secondPayload);
      const secondIdle =
        created.status === 202 && created.body.turn?.id
          ? observeIdle(publisher, created.body.turn.id)
          : undefined;
      if (secondIdle) idleObservations.push(secondIdle);
      expect(created.status).toBe(202);
      expect(created.body.turn).toMatchObject({ ordinal: 2, ...secondPayload });
      expect(created.body.conversation.deployments).toEqual(TEST_DEPLOYMENT_SUMMARIES);

      const replay = await request(app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send(secondPayload);
      expect(replay.status).toBe(202);
      expect(replay.body.turn.id).toBe(created.body.turn.id);
      expect(replay.body.conversation.deployments).toEqual(TEST_DEPLOYMENT_SUMMARIES);

      const busy = await request(app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send({ clientRequestId: THIRD_REQUEST_ID, prompt: 'Debe esperar' });
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe('CONVERSATION_BUSY');

      await Promise.all([
        providers['base-1'].waitUntilCalled(1),
        providers['base-2'].waitUntilCalled(1),
        providers['base-3'].waitUntilCalled(1),
      ]);
      gates.slice(0, 3).forEach(gate => gate.resolve());
      await secondIdle?.promise;

      const third = await request(app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send({ clientRequestId: THIRD_REQUEST_ID, prompt: 'Tercer turno' });
      const thirdIdle =
        third.status === 202 && third.body.turn?.id
          ? observeIdle(publisher, third.body.turn.id)
          : undefined;
      if (thirdIdle) idleObservations.push(thirdIdle);
      expect(third.status).toBe(202);
      expect(third.body.turn).toMatchObject({ ordinal: 3, clientRequestId: THIRD_REQUEST_ID });

      gates.slice(3).forEach(gate => gate.resolve());
      await thirdIdle?.promise;

      const persisted = await pool.query<{
        ordinal: number;
        client_request_id: string;
        status: string;
      }>(
        `SELECT ordinal, client_request_id::text, status
           FROM turns
          WHERE conversation_id = $1
          ORDER BY ordinal`,
        [CONVERSATION_ID]
      );
      expect(persisted.rows).toEqual([
        {
          ordinal: 1,
          client_request_id: '73100000-0000-4000-8000-000000000177',
          status: 'completed',
        },
        { ordinal: 2, client_request_id: SECOND_REQUEST_ID, status: 'completed' },
        { ordinal: 3, client_request_id: THIRD_REQUEST_ID, status: 'completed' },
      ]);
      expect(providers['base-1'].calls).toHaveLength(2);
      expect(providers['base-2'].calls).toHaveLength(2);
      expect(providers['base-3'].calls).toHaveLength(2);
      expect(providers.consolidator.calls).toHaveLength(2);
      for (const slot of ['base-1', 'base-2', 'base-3'] as const) {
        const firstPayload = JSON.stringify(providers[slot].calls[0]?.messages);
        expect(firstPayload).toContain(`${slot}-turn-1`);
        for (const other of ['base-1', 'base-2', 'base-3', 'consolidator'] as const) {
          if (other !== slot) expect(firstPayload).not.toContain(`${other}-turn-1`);
        }
      }
      const firstConsolidatorPayload = JSON.stringify(providers.consolidator.calls[0]?.messages);
      expect(firstConsolidatorPayload).toContain('consolidator-turn-1');
      expect(firstConsolidatorPayload).not.toContain('base-1-turn-1');
      for (const slot of ['base-1', 'base-2', 'base-3'] as const) {
        expect(firstConsolidatorPayload).toContain(`Deterministic ${slot} response`);
      }
      Object.values(providers).forEach(provider => {
        expect(provider.calls.map(call => call.deployment)).toEqual(
          provider.calls.map(() =>
            expect.objectContaining({
              deploymentId: `integration-${provider.slot}`,
              slot: provider.slot,
            })
          )
        );
      });
    } finally {
      gates.forEach(gate => gate.resolve());
      await Promise.all(idleObservations.map(({ promise }) => promise));
      idleObservations.forEach(({ unsubscribe }) => unsubscribe());
    }
  });

  it('uses the immutable snapshot limit and rejects oversized continuation before provider calls', async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
    await seedCompletedConversation(pool, 1);
    const providers = createControlledProviders();
    Object.values(providers).forEach(provider => {
      vi.spyOn(provider, 'measureInputTokens').mockResolvedValue(2);
    });
    const backend = createIntegrationBackend(pool, providers, []);

    try {
      const created = await request(backend.app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send({ clientRequestId: SECOND_REQUEST_ID, prompt: 'Oversized continuation.' });
      expect(created.status).toBe(202);
      expect(created.body.conversation.deployments).toEqual(TEST_DEPLOYMENT_SUMMARIES);

      await backend.conversationService.stop();

      expect(Object.values(providers).flatMap(provider => provider.calls)).toEqual([]);
      const persisted = await pool.query<{
        slot: string;
        status: string;
        errorCode: string | null;
        metadata: Record<string, unknown> | null;
      }>(
        `SELECT mr.slot, mr.status, mr.error_code AS "errorCode", mr.metadata
           FROM model_responses mr
           JOIN turns t ON t.id = mr.turn_id
          WHERE t.conversation_id = $1 AND t.ordinal = 2
          ORDER BY mr.slot`,
        [CONVERSATION_ID]
      );
      expect(persisted.rows).toHaveLength(4);
      expect(persisted.rows.every(row => row.status === 'failed')).toBe(true);
      expect(persisted.rows.every(row => row.errorCode === 'INVALID_PROMPT_SIZE')).toBe(true);
      expect(persisted.rows.every(row => JSON.stringify(row.metadata) === '{}')).toBe(true);
      const persistedAttemptData = JSON.stringify(persisted.rows).toLowerCase();
      expect(persistedAttemptData).not.toContain('oversized continuation');
      expect(persistedAttemptData).not.toMatch(
        /inputtokens|outputtokens|totaltokens|prompt_tokens|billing|cost|credit|budget|currency|price|economic/
      );

      const snapshots = await pool.query<{
        contextLimitTokens: number;
        unchanged: boolean;
      }>(
        `SELECT context_limit_tokens AS "contextLimitTokens",
                created_at = updated_at AS unchanged
           FROM conversation_deployments
          WHERE conversation_id = $1`,
        [CONVERSATION_ID]
      );
      expect(snapshots.rows).toEqual(
        snapshots.rows.map(() => ({ contextLimitTokens: 1, unchanged: true }))
      );
    } finally {
      await backend.conversationService.stop();
    }
  });

  it('reproduces the busy rejection while active response persistence races with turn creation', async () => {
    const providers = createControlledProviders();
    const baseGates = Array.from({ length: 3 }, () => deferred());
    const qwenGate = deferred();
    providers['base-1'].enqueueBlocked(baseGates[0]!.promise);
    providers['base-2'].enqueueBlocked(baseGates[1]!.promise);
    providers['base-3'].enqueueBlocked(baseGates[2]!.promise);
    providers.consolidator.enqueueBlocked(qwenGate.promise);

    const backend = createIntegrationBackend(pool, providers, []);
    const secondPayload = { clientRequestId: SECOND_REQUEST_ID, prompt: 'Turn activo' };
    let secondIdle: IdleObservation | undefined;
    let firstPostgresError: string | undefined;

    try {
      const assignmentChange = await request(backend.app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send({
          clientRequestId: SECOND_REQUEST_ID,
          prompt: 'Turn activo',
          deploymentIds: {
            'base-1': 'replacement-1',
            'base-2': 'replacement-2',
            'base-3': 'replacement-3',
            consolidator: 'replacement-4',
          },
        });
      expect(assignmentChange.status).toBe(422);
      expect(Object.values(providers).flatMap(provider => provider.calls)).toEqual([]);

      const created = await request(backend.app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send(secondPayload);
      expect(created.status).toBe(202);
      expect(created.body.turn).toMatchObject({ ordinal: 2, ...secondPayload });
      secondIdle = observeIdle(backend.publisher, created.body.turn.id);

      await Promise.all([
        providers['base-1'].waitUntilCalled(),
        providers['base-2'].waitUntilCalled(),
        providers['base-3'].waitUntilCalled(),
      ]);

      // Start the contender before releasing provider gates. This leaves the
      // two real transactions to contend on the conversation row without any
      // timing padding or private repository hooks.
      const busyPromise = request(backend.app)
        .post(`/api/v1/conversations/${CONVERSATION_ID}/turns`)
        .send({ clientRequestId: THIRD_REQUEST_ID, prompt: 'No debe crearse' })
        .then(response => {
          firstPostgresError ??= postgresCode(response.body);
          return response;
        });
      baseGates.forEach(gate => gate.resolve());

      await providers.consolidator.waitUntilCalled();
      qwenGate.resolve();
      const [busy] = await Promise.all([busyPromise, secondIdle.promise]);

      expect(
        { status: busy.status, body: safeResponseBody(busy.body), firstPostgresError },
        'T168 busy response (safe status/body only)'
      ).toMatchObject({
        status: 409,
        body: { code: 'CONVERSATION_BUSY' },
      });
      expect(providers['base-1'].calls).toHaveLength(1);
      expect(providers['base-2'].calls).toHaveLength(1);
      expect(providers['base-3'].calls).toHaveLength(1);
      expect(providers.consolidator.calls).toHaveLength(1);

      const persisted = await pool.query<{
        ordinal: number;
        client_request_id: string;
        status: string;
      }>(
        `SELECT ordinal, client_request_id::text, status
           FROM turns
          WHERE conversation_id = $1
          ORDER BY ordinal`,
        [CONVERSATION_ID]
      );
      expect(persisted.rows).toEqual([
        {
          ordinal: 1,
          client_request_id: '73100000-0000-4000-8000-000000000177',
          status: 'completed',
        },
        { ordinal: 2, client_request_id: SECOND_REQUEST_ID, status: 'completed' },
      ]);
    } finally {
      baseGates.forEach(gate => gate.resolve());
      qwenGate.resolve();
      await backend.conversationService.stop();
      secondIdle?.unsubscribe();
    }
  });
});

interface IdleObservation {
  promise: Promise<void>;
  unsubscribe: () => void;
}

function observeIdle(
  publisher: { subscribe: (turnId: string, listener: (event: any) => void) => () => void },
  turnId: string
): IdleObservation {
  let unsubscribe: () => void = () => undefined;
  const promise = new Promise<void>(resolve => {
    unsubscribe = publisher.subscribe(turnId, event => {
      if (event.event === 'busy_update' && event.data.hasWorkInProgress === false) {
        unsubscribe();
        resolve();
      }
    });
  });
  return { promise, unsubscribe: () => unsubscribe() };
}

function safeResponseBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const value = body as Record<string, unknown>;
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    requestId: typeof value.requestId === 'string' ? value.requestId : undefined,
  };
}

function postgresCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const debug = (body as Record<string, unknown>).debug;
  if (!debug || typeof debug !== 'object') return undefined;
  const postgres = (debug as Record<string, unknown>).postgres;
  if (!postgres || typeof postgres !== 'object') return undefined;
  const code = (postgres as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

async function seedCompletedConversation(pool: Pool, contextLimitTokens = 10_000): Promise<void> {
  await pool.query(
    `INSERT INTO conversations (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, '73000000-0000-4000-8000-000000000177', 'Conversación existente', $2, $2)`,
    [CONVERSATION_ID, NOW]
  );
  const deployments = TEST_DEPLOYMENT_SNAPSHOTS.map(snapshot => ({
    ...snapshot,
    contextLimitTokens,
  })) as unknown as ConversationDeploymentSnapshotTuple;
  await insertConversationDeployments(pool, CONVERSATION_ID, deployments);
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, '73100000-0000-4000-8000-000000000177', 1, 'Primer turno', 'completed', $3, $3)`,
    [FIRST_TURN_ID, CONVERSATION_ID, NOW]
  );
  await pool.query(
    `INSERT INTO model_responses
       (id, turn_id, slot, role, provider, model, status, content, error_recoverable,
        is_stale, attempt_no, completed_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1, slot,
            CASE WHEN slot = 'consolidator' THEN 'consolidator' ELSE 'base' END,
            slot, slot || '-model', 'completed', slot || '-turn-1', false,
            false, 1, $2, $2, $2
       FROM unnest(ARRAY['base-1', 'base-2', 'base-3', 'consolidator']) AS slot`,
    [FIRST_TURN_ID, NOW]
  );
}
