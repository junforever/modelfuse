import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEPLOYMENT_CATALOG } from '../../../llm/deploymentCatalog.js';
import { ConversationRepository } from '../conversationRepository.js';
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

const CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000031';
const FAILURE_FUNCTION = 't030_fail_consolidator_response';
const FAILURE_TRIGGER = 't030_fail_consolidator_response_trigger';
const DEPLOYMENTS = [
  snapshot('base-1', 'openai-5.6-terra'),
  snapshot('base-2', 'gemini-3.7-flash'),
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
    await deleteOwnedConversationRequests(pool, [CLIENT_REQUEST_ID]);
  });

  afterEach(async () => {
    await dropFailureTrigger(pool);
    await deleteOwnedConversationRequests(pool, [CLIENT_REQUEST_ID]);
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
      }),
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
      [CLIENT_REQUEST_ID],
    );

    expect(durable.rows[0]).toEqual({
      conversations: 0,
      deployments: 0,
      turns: 0,
      responses: 0,
    });
  });
});

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
