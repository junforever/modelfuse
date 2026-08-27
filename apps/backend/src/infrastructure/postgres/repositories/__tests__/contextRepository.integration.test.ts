import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ContextRepository } from '../contextRepository.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
} from '../../../../test/integration/testDatabase.js';

const CONVERSATION_ID = '71000000-0000-4000-8000-000000000076';
const OTHER_CONVERSATION_ID = '72000000-0000-4000-8000-000000000076';
const OWNED_CONVERSATIONS = [CONVERSATION_ID, OTHER_CONVERSATION_ID] as const;
const NOW = '2026-07-26T20:00:00.000Z';

describe('ContextRepository PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, OWNED_CONVERSATIONS);
    await seedContextHistory(pool);
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, OWNED_CONVERSATIONS);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('returns only the requested base slot from the recent ordered conversation window', async () => {
    const repository = new ContextRepository(pool);

    await expect(
      repository.getBaseContext({
        conversationId: CONVERSATION_ID,
        beforeOrdinal: 5,
        slot: 'base-1',
        maxTurns: 3,
      })
    ).resolves.toEqual([
      { ordinal: 2, prompt: 'prompt-2', response: 'base-1-2' },
      { ordinal: 3, prompt: 'prompt-3', response: null },
      { ordinal: 4, prompt: 'prompt-4', response: 'base-1-4' },
    ]);
  });

  it('returns only prior current consolidations and excludes stale or failed assistant content', async () => {
    const repository = new ContextRepository(pool);

    await expect(
      repository.getConsolidatorContext({
        conversationId: CONVERSATION_ID,
        beforeOrdinal: 5,
        maxTurns: 3,
      })
    ).resolves.toEqual([
      { ordinal: 2, prompt: 'prompt-2', response: 'consolidator-2' },
      { ordinal: 3, prompt: 'prompt-3', response: null },
      { ordinal: 4, prompt: 'prompt-4', response: null },
    ]);
  });
});

async function seedContextHistory(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO conversations (id, create_client_request_id, title, created_at, updated_at)
     VALUES
       ($1, '71000000-0000-4000-8000-000000000176', 'owned', $3, $3),
       ($2, '72000000-0000-4000-8000-000000000176', 'other', $3, $3)`,
    [CONVERSATION_ID, OTHER_CONVERSATION_ID, NOW]
  );

  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    await insertTurn(pool, CONVERSATION_ID, ordinal, `prompt-${ordinal}`);
  }
  await insertTurn(pool, OTHER_CONVERSATION_ID, 4, 'other-conversation-prompt');

  await insertResponse(pool, CONVERSATION_ID, 1, 'base-1', 'completed', 'outside-window');
  await insertResponse(pool, CONVERSATION_ID, 2, 'base-1', 'completed', 'base-1-2');
  await insertResponse(pool, CONVERSATION_ID, 2, 'base-2', 'completed', 'base-2-must-not-leak');
  await insertResponse(pool, CONVERSATION_ID, 2, 'consolidator', 'completed', 'consolidator-2');
  await insertResponse(pool, CONVERSATION_ID, 3, 'base-1', 'failed', 'failed-base-must-not-leak');
  await insertResponse(
    pool,
    CONVERSATION_ID,
    3,
    'consolidator',
    'completed',
    'stale-consolidator-must-not-leak',
    true
  );
  await insertResponse(pool, CONVERSATION_ID, 4, 'base-1', 'completed', 'base-1-4');
  await insertResponse(pool, CONVERSATION_ID, 4, 'base-3', 'completed', 'base-3-must-not-leak');
  await insertResponse(
    pool,
    CONVERSATION_ID,
    4,
    'consolidator',
    'failed',
    'failed-consolidator-must-not-leak'
  );
  await insertResponse(pool, OTHER_CONVERSATION_ID, 4, 'base-1', 'completed', 'other-base');
  await insertResponse(
    pool,
    OTHER_CONVERSATION_ID,
    4,
    'consolidator',
    'completed',
    'other-consolidator'
  );
}

async function insertTurn(
  pool: Pool,
  conversationId: string,
  ordinal: number,
  prompt: string
): Promise<void> {
  const namespace = conversationId === CONVERSATION_ID ? '71' : '72';
  const suffix = String(ordinal).padStart(12, '0');
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', $6, $6)`,
    [
      `${namespace}100000-0000-4000-8000-${suffix}`,
      conversationId,
      `${namespace}200000-0000-4000-8000-${suffix}`,
      ordinal,
      prompt,
      NOW,
    ]
  );
}

async function insertResponse(
  pool: Pool,
  conversationId: string,
  ordinal: number,
  slot: 'base-1' | 'base-2' | 'base-3' | 'consolidator',
  status: 'completed' | 'failed',
  content: string,
  isStale = false
): Promise<void> {
  const namespace = conversationId === CONVERSATION_ID ? '71' : '72';
  const turnSuffix = String(ordinal).padStart(12, '0');
  await pool.query(
    `INSERT INTO model_responses
       (id, turn_id, slot, role, provider, model, status, content, error_code,
        error_recoverable, is_stale, attempt_no, completed_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::varchar, $3::varchar, $2::varchar,
             $2::text || '-model', $4::varchar, $5::text, $6::varchar,
             false, $7::boolean, 1, $8::timestamptz, $8::timestamptz, $8::timestamptz)`,
    [
      `${namespace}100000-0000-4000-8000-${turnSuffix}`,
      slot,
      slot === 'consolidator' ? 'consolidator' : 'base',
      status,
      content,
      status === 'failed' ? 'provider_error' : null,
      isStale,
      NOW,
    ]
  );
}
