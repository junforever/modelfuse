import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ConversationRepository } from '../conversationRepository.js';
import {
  CANONICAL_SLOTS,
  insertConversationDeployments,
  TEST_DEPLOYMENT_SUMMARIES,
} from '../../../../test/integration/conversationDeploymentFixtures.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
} from '../../../../test/integration/testDatabase.js';

const HISTORY_ID = '90000000-0000-4000-8000-000000000090';
const OTHER_HISTORY_ID = '90000000-0000-4000-8000-000000000096';
const SIDEBAR_IDS = [
  '90000000-0000-4000-8000-000000000091',
  '90000000-0000-4000-8000-000000000092',
  '90000000-0000-4000-8000-000000000093',
  '90000000-0000-4000-8000-000000000094',
] as const;
const INSERTED_AFTER_CURSOR_ID = '90000000-0000-4000-8000-000000000095';
const OWNED_IDS = [HISTORY_ID, OTHER_HISTORY_ID, ...SIDEBAR_IDS, INSERTED_AFTER_CURSOR_ID] as const;

describe('ConversationRepository history PostgreSQL integration', () => {
  let pool: Pool;
  let repository: ConversationRepository;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
    repository = new ConversationRepository(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, OWNED_IDS);
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, OWNED_IDS);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('keeps sidebar keyset traversal stable when a newer conversation is inserted', async () => {
    await seedSidebar(pool);
    const first = await repository.listConversations(2);

    expect(first.items.map(({ id }) => id)).toEqual([SIDEBAR_IDS[3], SIDEBAR_IDS[2]]);
    expect(first.nextCursor).toEqual(expect.any(String));

    await insertConversation(
      pool,
      INSERTED_AFTER_CURSOR_ID,
      '2026-07-26T20:05:00.000Z',
      'inserted-after-cursor'
    );
    const second = await repository.listConversations(2, first.nextCursor ?? undefined);

    expect(second.items.map(({ id }) => id)).toEqual([SIDEBAR_IDS[1], SIDEBAR_IDS[0]]);
    expect([...first.items, ...second.items].map(({ id }) => id)).toHaveLength(4);
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(4);
    expect([...first.items, ...second.items].map(({ id }) => id)).not.toContain(
      INSERTED_AFTER_CURSOR_ID
    );
  });

  it('returns seven complete turns in chronological 3/3/1 blocks without gaps', async () => {
    await seedHistory(pool);
    const snapshotsBefore = await deploymentRows(pool, HISTORY_ID);
    const detail = await repository.getConversation(HISTORY_ID);
    const recent = await repository.listTurns(HISTORY_ID);
    const middle = await repository.listTurns(HISTORY_ID, recent.olderCursor ?? undefined);
    const oldest = await repository.listTurns(HISTORY_ID, middle.olderCursor ?? undefined);

    expect(recent.items.map(({ ordinal }) => ordinal)).toEqual([5, 6, 7]);
    expect(middle.items.map(({ ordinal }) => ordinal)).toEqual([2, 3, 4]);
    expect(oldest.items.map(({ ordinal }) => ordinal)).toEqual([1]);
    expect([recent.hasOlder, middle.hasOlder, oldest.hasOlder]).toEqual([true, true, false]);
    expect(oldest.olderCursor).toBeNull();

    const all = [...oldest.items, ...middle.items, ...recent.items];
    expect(all.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const turn of all) {
      expect(turn.prompt).toBe(`prompt-${turn.ordinal}`);
      expect(turn.responses.map(({ slot }) => slot)).toEqual(CANONICAL_SLOTS);
      expect(turn.responses.every(({ content }) => content?.endsWith(`-${turn.ordinal}`))).toBe(
        true
      );
    }
    expect(detail?.deployments).toEqual(TEST_DEPLOYMENT_SUMMARIES);
    expect(JSON.stringify(all)).not.toContain('other-conversation-canary');
    expect(await deploymentRows(pool, HISTORY_ID)).toEqual(snapshotsBefore);
    expect(snapshotsBefore.every(row => row.createdAt.getTime() === row.updatedAt.getTime())).toBe(
      true
    );
  });
});

async function seedSidebar(pool: Pool): Promise<void> {
  await insertConversation(pool, SIDEBAR_IDS[0], '2026-07-26T20:01:00.000Z', 'sidebar-1');
  await insertConversation(pool, SIDEBAR_IDS[1], '2026-07-26T20:02:00.000Z', 'sidebar-2');
  await insertConversation(pool, SIDEBAR_IDS[2], '2026-07-26T20:04:00.000Z', 'sidebar-3');
  await insertConversation(pool, SIDEBAR_IDS[3], '2026-07-26T20:04:00.000Z', 'sidebar-4');
}

async function seedHistory(pool: Pool): Promise<void> {
  await insertConversation(pool, HISTORY_ID, '2026-07-26T20:00:00.000Z', 'history');
  await insertConversationDeployments(pool, HISTORY_ID);
  for (let ordinal = 1; ordinal <= 7; ordinal += 1) {
    await insertCompletedTurn(pool, HISTORY_ID, ordinal);
  }
  await insertConversation(pool, OTHER_HISTORY_ID, '2026-07-26T20:00:08.000Z', 'other-history');
  await insertConversationDeployments(pool, OTHER_HISTORY_ID);
  await insertCompletedTurn(pool, OTHER_HISTORY_ID, 7, 'other-conversation-canary');
}

async function insertConversation(
  pool: Pool,
  id: string,
  updatedAt: string,
  title: string
): Promise<void> {
  await pool.query(
    `INSERT INTO conversations
       (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)`,
    [id, requestId(id, 1), title, updatedAt]
  );
}

async function insertCompletedTurn(
  pool: Pool,
  conversationId: string,
  ordinal: number,
  contentSuffix = String(ordinal)
): Promise<void> {
  const turnId = requestId(conversationId, 100 + ordinal);
  const timestamp = `2026-07-26T20:00:${String(ordinal).padStart(2, '0')}.000Z`;
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', $6, $6)`,
    [
      turnId,
      conversationId,
      requestId(conversationId, 200 + ordinal),
      ordinal,
      `prompt-${ordinal}`,
      timestamp,
    ]
  );
  await pool.query(
    `INSERT INTO model_responses
       (id, turn_id, slot, role, provider, model, status, content, error_recoverable,
        is_stale, attempt_no, completed_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1, slot,
            CASE WHEN slot = 'consolidator' THEN 'consolidator' ELSE 'base' END,
            slot, slot || '-model', 'completed', slot || '-' || $2, false,
            false, 1, $3, $3, $3
       FROM unnest(ARRAY['base-1', 'base-2', 'base-3', 'consolidator']) AS slot`,
    [turnId, contentSuffix, timestamp]
  );
}

async function deploymentRows(pool: Pool, conversationId: string) {
  return (
    await pool.query<{
      slot: string;
      deploymentId: string;
      providerId: string;
      modelId: string;
      displayName: string;
      contextLimitTokens: number;
      maxOutputTokens: number | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT slot, deployment_id AS "deploymentId", provider_id AS "providerId",
              model_id AS "modelId", display_name AS "displayName",
              context_limit_tokens AS "contextLimitTokens",
              max_output_tokens AS "maxOutputTokens",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversation_deployments
        WHERE conversation_id = $1
        ORDER BY slot`,
      [conversationId]
    )
  ).rows;
}

function requestId(id: string, value: number): string {
  const uniqueSuffix = BigInt(id.slice(-12)) + BigInt(value);
  return `${id.slice(0, -12)}${String(uniqueSuffix).padStart(12, '0')}`;
}
