import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEPLOYMENT_CATALOG } from '../../../llm/deploymentCatalog.js';
import { ConversationRepository } from '../conversationRepository.js';
import {
  ControlledLlmProvider,
  deferred,
} from '../../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversationRequests,
} from '../../../../test/integration/testDatabase.js';
import type {
  ConversationDeploymentSnapshotTuple,
  DeploymentDefinition,
  ResponseSlot,
} from '../../../../types/conversations.js';
import type { ProviderRegistry } from '../../../../types/llm.js';

const CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000031';
const IMMUTABLE_CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000032';
const REPLAY_CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000033';
const DUPLICATE_CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000041';
const DISTINCT_CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000042';
const OWNED_CLIENT_REQUEST_IDS = [
  CLIENT_REQUEST_ID,
  IMMUTABLE_CLIENT_REQUEST_ID,
  REPLAY_CLIENT_REQUEST_ID,
  DUPLICATE_CLIENT_REQUEST_ID,
  DISTINCT_CLIENT_REQUEST_ID,
] as const;
const FAILURE_FUNCTION = 't030_fail_consolidator_response';
const FAILURE_TRIGGER = 't030_fail_consolidator_response_trigger';
const DEPLOYMENTS = [
  snapshot('base-1', 'openai-5.6-terra'),
  snapshot('base-2', 'gemini-3.7-flash'),
  snapshot('base-3', 'openrouter-minimax-m3'),
  snapshot('consolidator', 'openrouter-qwen-3.8-max'),
] as const satisfies ConversationDeploymentSnapshotTuple;
const DUPLICATE_DEPLOYMENTS = [
  snapshot('base-1', 'openai-5.6-sol'),
  snapshot('base-2', 'gemini-3.7-flash'),
  snapshot('base-3', 'openai-5.6-sol'),
  snapshot('consolidator', 'openrouter-qwen-3.8-max'),
] as const satisfies ConversationDeploymentSnapshotTuple;
const DISTINCT_DEPLOYMENTS = [
  { ...snapshot('base-1', 'openai-5.6-sol'), modelId: 'shared-underlying-model' },
  { ...snapshot('base-2', 'openai-5.6-terra'), modelId: 'shared-underlying-model' },
  snapshot('base-3', 'openrouter-minimax-m3'),
  snapshot('consolidator', 'openrouter-qwen-3.8-max'),
] as const satisfies ConversationDeploymentSnapshotTuple;

describe('ConversationRepository explicit deployment transaction', () => {
  let pool: Pool;
  let repository: ConversationRepository;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
    repository = new ConversationRepository(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversationRequests(pool, OWNED_CLIENT_REQUEST_IDS);
  });

  afterEach(async () => {
    await dropFailureTrigger(pool);
    await deleteOwnedConversationRequests(pool, OWNED_CLIENT_REQUEST_IDS);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('rolls back the conversation, four snapshots, first turn, and prior response rows when the fourth response insert fails', async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION ${FAILURE_FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.slot = 'consolidator' AND EXISTS (
          SELECT 1
            FROM turns turn_row
            JOIN conversations conversation ON conversation.id = turn_row.conversation_id
           WHERE turn_row.id = NEW.turn_id
             AND conversation.create_client_request_id = '${CLIENT_REQUEST_ID}'::uuid
        ) THEN
          RAISE EXCEPTION 'controlled T030 fourth response failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER ${FAILURE_TRIGGER}
        BEFORE INSERT ON model_responses
        FOR EACH ROW EXECUTE FUNCTION ${FAILURE_FUNCTION}();
    `);

    await expect(
      repository.createConversation({
        clientRequestId: CLIENT_REQUEST_ID,
        prompt: 'This explicit creation must remain atomic.',
        title: 'This explicit creation must remain atomic.',
        deployments: DEPLOYMENTS,
      })
    ).rejects.toThrow('controlled T030 fourth response failure');

    const durable = await pool.query<{
      conversations: number;
      deployments: number;
      turns: number;
      responses: number;
    }>(
      `WITH owned_conversations AS (
         SELECT id FROM conversations WHERE create_client_request_id = $1
       ), owned_turns AS (
         SELECT id FROM turns WHERE conversation_id IN (SELECT id FROM owned_conversations)
       )
       SELECT
         (SELECT count(*)::int FROM owned_conversations) AS conversations,
         (SELECT count(*)::int FROM conversation_deployments
           WHERE conversation_id IN (SELECT id FROM owned_conversations)) AS deployments,
         (SELECT count(*)::int FROM owned_turns) AS turns,
         (SELECT count(*)::int FROM model_responses
           WHERE turn_id IN (SELECT id FROM owned_turns)) AS responses`,
      [CLIENT_REQUEST_ID]
    );

    expect(durable.rows[0]).toEqual({
      conversations: 0,
      deployments: 0,
      turns: 0,
      responses: 0,
    });
  });

  it('maps the named duplicate guard and rolls back every creation row', async () => {
    const constraint = await pool.query<{ name: string }>(
      `SELECT conname AS name
         FROM pg_constraint
        WHERE conrelid = 'conversation_deployments'::regclass
          AND conname = 'uq_conversation_deployments_conversation_deployment'`
    );
    expect(constraint.rows).toEqual([
      { name: 'uq_conversation_deployments_conversation_deployment' },
    ]);

    await expect(
      repository.createConversation({
        clientRequestId: DUPLICATE_CLIENT_REQUEST_ID,
        prompt: 'The database guard must reject this duplicate.',
        title: 'The database guard must reject this duplicate.',
        deployments: DUPLICATE_DEPLOYMENTS,
      })
    ).resolves.toEqual({ kind: 'duplicate_deployment_assignment' });

    expect(await readOwnedRowCounts(pool, DUPLICATE_CLIENT_REQUEST_ID)).toEqual({
      conversations: 0,
      deployments: 0,
      turns: 0,
      responses: 0,
    });
  });

  it('creates distinct deployment IDs that share a provider and underlying model', async () => {
    const created = await repository.createConversation({
      clientRequestId: DISTINCT_CLIENT_REQUEST_ID,
      prompt: 'Distinct IDs may share provider and model.',
      title: 'Distinct IDs may share provider and model.',
      deployments: DISTINCT_DEPLOYMENTS,
    });
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') throw new Error('Expected a newly created conversation');

    const rows = await readDeploymentRows(pool, created.conversationId);
    expect(
      rows.slice(0, 2).map(({ deploymentId, providerId, modelId }) => ({
        deploymentId,
        providerId,
        modelId,
      }))
    ).toEqual([
      {
        deploymentId: 'openai-5.6-sol',
        providerId: 'openai',
        modelId: 'shared-underlying-model',
      },
      {
        deploymentId: 'openai-5.6-terra',
        providerId: 'openai',
        modelId: 'shared-underlying-model',
      },
    ]);
  });

  it('persists four immutable canonical snapshots and rejects every direct update', async () => {
    const created = await repository.createConversation({
      clientRequestId: IMMUTABLE_CLIENT_REQUEST_ID,
      prompt: 'Persist immutable deployment snapshots.',
      title: 'Persist immutable deployment snapshots.',
      deployments: DEPLOYMENTS,
    });
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') throw new Error('Expected a newly created conversation');

    const before = await readDeploymentRows(pool, created.conversationId);
    expect(before).toHaveLength(4);
    expect(before.map(row => row.slot)).toEqual(['base-1', 'base-2', 'base-3', 'consolidator']);
    before.forEach(row => expect(row.updatedAt).toEqual(row.createdAt));

    await expect(
      pool.query(
        `UPDATE conversation_deployments
            SET display_name = 'Replacement forbidden'
          WHERE conversation_id = $1 AND slot = 'base-1'`,
        [created.conversationId]
      )
    ).rejects.toThrow('conversation deployments are immutable');
    expect(await readDeploymentRows(pool, created.conversationId)).toEqual(before);
  });

  it('returns the original snapshots on replay after catalog/configuration change and does not relaunch', async () => {
    const gates = [deferred(), deferred(), deferred()] as const;
    const openai = new ControlledLlmProvider('base-1');
    const google = new ControlledLlmProvider('base-2');
    const openrouter = new ControlledLlmProvider('base-3', [], {
      providerId: 'openrouter',
      provider: 'openrouter-fake',
      model: 'openrouter-test-model',
    });
    openai.enqueueBlocked(gates[0].promise);
    google.enqueueBlocked(gates[1].promise);
    openrouter.enqueueBlocked(gates[2].promise);
    openrouter.enqueueResult('Consolidated response');
    const providers: ProviderRegistry = { openai, google, openrouter };
    const initial = createIntegrationBackend(pool, providers);

    try {
      const payload = {
        clientRequestId: REPLAY_CLIENT_REQUEST_ID,
        prompt: 'Replay must preserve the original snapshots.',
        deploymentIds: Object.fromEntries(
          DEPLOYMENTS.map(({ slot, deploymentId }) => [slot, deploymentId])
        ),
      };
      const created = await request(initial.app).post('/api/v1/conversations').send(payload);
      expect(created.status).toBe(201);
      await Promise.all([
        openai.waitUntilCalled(),
        google.waitUntilCalled(),
        openrouter.waitUntilCalled(),
      ]);
      const callsBeforeReplay = [openai.calls.length, google.calls.length, openrouter.calls.length];

      const changed = createIntegrationBackend(pool, providers, []);
      const replayed = await request(changed.app)
        .post('/api/v1/conversations')
        .send({
          ...payload,
          deploymentIds: {
            'base-1': 'removed-from-catalog-1',
            'base-2': 'removed-from-catalog-2',
            'base-3': 'removed-from-catalog-3',
            consolidator: 'removed-from-catalog-4',
          },
        });

      expect(replayed.status).toBe(201);
      expect(replayed.body.conversation.id).toBe(created.body.conversation.id);
      expect(replayed.body.turn.id).toBe(created.body.turn.id);
      expect(replayed.body.conversation.deployments).toEqual(created.body.conversation.deployments);
      expect(
        replayed.body.conversation.deployments.map(({ slot }: { slot: string }) => slot)
      ).toEqual(['base-1', 'base-2', 'base-3', 'consolidator']);
      expect([openai.calls.length, google.calls.length, openrouter.calls.length]).toEqual(
        callsBeforeReplay
      );
      await changed.conversationService.stop();
    } finally {
      gates.forEach(gate => gate.resolve());
      await initial.conversationService.stop();
    }
  });
});

async function readDeploymentRows(pool: Pool, conversationId: string) {
  const result = await pool.query<{
    slot: ResponseSlot;
    deploymentId: string;
    providerId: string;
    modelId: string;
    displayName: string;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT slot, deployment_id AS "deploymentId", provider_id AS "providerId",
            model_id AS "modelId", display_name AS "displayName",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM conversation_deployments
      WHERE conversation_id = $1
      ORDER BY CASE slot
        WHEN 'base-1' THEN 1 WHEN 'base-2' THEN 2
        WHEN 'base-3' THEN 3 WHEN 'consolidator' THEN 4 END`,
    [conversationId]
  );
  return result.rows;
}

async function readOwnedRowCounts(pool: Pool, clientRequestId: string) {
  const result = await pool.query<{
    conversations: number;
    deployments: number;
    turns: number;
    responses: number;
  }>(
    `WITH owned_conversations AS (
       SELECT id FROM conversations WHERE create_client_request_id = $1
     ), owned_turns AS (
       SELECT id FROM turns WHERE conversation_id IN (SELECT id FROM owned_conversations)
     )
     SELECT
       (SELECT count(*)::int FROM owned_conversations) AS conversations,
       (SELECT count(*)::int FROM conversation_deployments
         WHERE conversation_id IN (SELECT id FROM owned_conversations)) AS deployments,
       (SELECT count(*)::int FROM owned_turns) AS turns,
       (SELECT count(*)::int FROM model_responses
         WHERE turn_id IN (SELECT id FROM owned_turns)) AS responses`,
    [clientRequestId]
  );
  return result.rows[0];
}

async function dropFailureTrigger(pool: Pool): Promise<void> {
  await pool.query(`DROP TRIGGER IF EXISTS ${FAILURE_TRIGGER} ON model_responses`);
  await pool.query(`DROP FUNCTION IF EXISTS ${FAILURE_FUNCTION}()`);
}

function snapshot<Slot extends ResponseSlot>(slot: Slot, deploymentId: string) {
  const definition = deployment(deploymentId);
  const { credentialEnv: _credentialEnv, ...publicDefinition } = definition;
  return { slot, ...publicDefinition };
}

function deployment(deploymentId: string): DeploymentDefinition {
  const selected = DEPLOYMENT_CATALOG.find(item => item.deploymentId === deploymentId);
  if (!selected) throw new Error(`Missing T030 deployment fixture: ${deploymentId}`);
  return selected;
}
