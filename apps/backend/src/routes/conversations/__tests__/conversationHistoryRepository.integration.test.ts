import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ConversationRepository } from '../../../infrastructure/postgres/repositories/conversationRepository.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
} from '../../../test/integration/testDatabase.js';

const CONVERSATION_ID = '91000000-0000-4000-8000-000000000090';
const CLIENT_REQUEST_ID = '91000000-0000-4000-8000-000000000091';
const SLOT_CAPABILITIES = [
  ['base-1', true],
  ['base-2', false],
  ['base-3', false],
  ['consolidator', true],
] as const;

describe('conversation web search history PostgreSQL integration', () => {
  let pool: Pool;
  let repository: ConversationRepository;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
    repository = new ConversationRepository(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, [CONVERSATION_ID]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('round-trips per-turn intent and immutable deployment capability snapshots without catalog lookup', async () => {
    await seedConversation(pool);
    const persistedCapabilities = await readPersistedCapabilities(pool);

    const detail = await repository.getConversation(CONVERSATION_ID);
    const history = await repository.listTurns(CONVERSATION_ID);

    expect(detail?.deployments).toEqual(
      SLOT_CAPABILITIES.map(([slot, supportsWebSearch]) => ({
        slot,
        deploymentId: `historical-${slot}`,
        providerId: 'openrouter',
        modelId: `retired-model/${slot}`,
        displayName: `Historical ${slot}`,
        supportsWebSearch,
      }))
    );
    expect(
      history.items.map(turn => ({
        ordinal: turn.ordinal,
        webSearchEnabled: turn.webSearchEnabled,
      }))
    ).toEqual([
      { ordinal: 1, webSearchEnabled: false },
      { ordinal: 2, webSearchEnabled: true },
    ]);
    expect(await readPersistedCapabilities(pool)).toEqual(persistedCapabilities);
    expect(
      persistedCapabilities.every(row => row.createdAt.getTime() === row.updatedAt.getTime())
    ).toBe(true);
  });
});

async function seedConversation(pool: Pool): Promise<void> {
  const timestamp = '2026-09-02T10:00:00.000Z';
  await pool.query(
    `INSERT INTO conversations
       (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, $2, 'Historical web search', $3, $3)`,
    [CONVERSATION_ID, CLIENT_REQUEST_ID, timestamp]
  );

  for (const [slot, supportsWebSearch] of SLOT_CAPABILITIES) {
    await pool.query(
      `INSERT INTO conversation_deployments
         (conversation_id, slot, deployment_id, provider_id, model_id, display_name,
          supports_web_search, context_limit_tokens, max_output_tokens,
          input_modalities, output_modalities, created_at, updated_at)
       VALUES ($1, $2, $3, 'openrouter', $4, $5, $6, 10000, 1000,
               ARRAY['text'], ARRAY['text'], $7, $7)`,
      [
        CONVERSATION_ID,
        slot,
        `historical-${slot}`,
        `retired-model/${slot}`,
        `Historical ${slot}`,
        supportsWebSearch,
        timestamp,
      ]
    );
  }

  await insertTurn(pool, 1, false);
  await insertTurn(pool, 2, true);
}

async function insertTurn(pool: Pool, ordinal: number, webSearchEnabled: boolean): Promise<void> {
  const turnId = `92000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
  const requestId = `93000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
  const timestamp = `2026-09-02T10:00:0${ordinal}.000Z`;
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content,
        web_search_enabled, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $7)`,
    [
      turnId,
      CONVERSATION_ID,
      requestId,
      ordinal,
      `Historical prompt ${ordinal}`,
      webSearchEnabled,
      timestamp,
    ]
  );
  await pool.query(
    `INSERT INTO model_responses
       (id, turn_id, slot, role, provider, model, status, content, error_recoverable,
        is_stale, attempt_no, completed_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1, slot,
            CASE WHEN slot = 'consolidator' THEN 'consolidator' ELSE 'base' END,
            'openrouter', 'retired-model/' || slot, 'completed', slot || '-answer', false,
            false, 1, $2, $2, $2
       FROM unnest(ARRAY['base-1', 'base-2', 'base-3', 'consolidator']) AS slot`,
    [turnId, timestamp]
  );
}

async function readPersistedCapabilities(pool: Pool) {
  return (
    await pool.query<{
      slot: string;
      supportsWebSearch: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT slot, supports_web_search AS "supportsWebSearch",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversation_deployments
        WHERE conversation_id = $1
        ORDER BY CASE slot
          WHEN 'base-1' THEN 1 WHEN 'base-2' THEN 2
          WHEN 'base-3' THEN 3 WHEN 'consolidator' THEN 4 END`,
      [CONVERSATION_ID]
    )
  ).rows;
}
