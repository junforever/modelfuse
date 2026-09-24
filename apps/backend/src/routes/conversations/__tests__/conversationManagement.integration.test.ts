import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createControlledProviders } from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  insertConversationDeployments,
  TEST_DEPLOYMENT_SUMMARIES,
} from '../../../test/integration/conversationDeploymentFixtures.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
  dropIntegrationSchema,
} from '../../../test/integration/testDatabase.js';

const IDLE_ID = '91000000-0000-4000-8000-000000000091';
const BUSY_ID = '91000000-0000-4000-8000-000000000092';
const OWNED_IDS = [IDLE_ID, BUSY_ID] as const;
const NOW = '2026-07-26T20:00:00.000Z';

describe('conversation management HTTP/PostgreSQL integration', () => {
  let pool: Pool;
  let app: ReturnType<typeof createIntegrationBackend>['app'];

  beforeAll(async () => {
    pool = createIntegrationPool({ schema: 'conversation_management' });
    await assertModelFuseSchema(pool);
    app = createIntegrationBackend(pool, createControlledProviders()).app;
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, OWNED_IDS);
    await seedConversation(pool, IDLE_ID, 'completed', 'Conversación idle');
    await seedConversation(pool, BUSY_ID, 'running', 'Conversación busy');
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, OWNED_IDS);
  });

  afterAll(async () => {
    await dropIntegrationSchema(pool);
    await pool?.end();
  });

  it('lists summaries and returns detail without loading turns', async () => {
    const snapshotsBefore = await deploymentRows(pool, IDLE_ID);
    const list = await request(app).get('/api/v1/conversations');
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ id: BUSY_ID, hasWorkInProgress: true }),
      expect.objectContaining({ id: IDLE_ID, hasWorkInProgress: false }),
    ]);

    const detail = await request(app).get(`/api/v1/conversations/${IDLE_ID}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: IDLE_ID,
      title: 'Conversación idle',
      hasWorkInProgress: false,
      deployments: TEST_DEPLOYMENT_SUMMARIES,
    });
    expect(detail.body).not.toHaveProperty('turns');
    expect(JSON.stringify(detail.body)).not.toContain(BUSY_ID);
    expect(await deploymentRows(pool, IDLE_ID)).toEqual(snapshotsBefore);
    expect(snapshotsBefore.every(row => row.createdAt.getTime() === row.updatedAt.getTime())).toBe(
      true
    );
  });

  it.each([
    ['quotes', `Título con "dobles" y 'simples'`],
    ['angle brackets and HTML', '<b>HTML literal</b> < >'],
    ['accents', 'Información útil: canción y café'],
    ['simple emoji', 'Informe 😀'],
    ['ZWJ emoji', 'Familia 👨‍👩‍👧‍👦'],
    ['combining mark', `Cafe\u0301 sin normalizar`],
    ['SQL-looking text', `Robert'); DELETE FROM conversations;--`],
  ])('persists trimmed %s literally through the rename endpoint', async (_case, title) => {
    const response = await request(app)
      .patch(`/api/v1/conversations/${IDLE_ID}`)
      .send({ title: `  ${title}  ` });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe(title);
    const persisted = await pool.query<{ title: string }>(
      'SELECT title FROM conversations WHERE id = $1',
      [IDLE_ID]
    );
    expect(persisted.rows).toEqual([{ title }]);
  });

  it('accepts exactly 80 graphemes and rejects 81 without changing the stored title', async () => {
    const eighty = `${'a'.repeat(79)}👨‍👩‍👧‍👦`;
    const eightyOne = `${eighty}e\u0301`;
    expect(countGraphemes(eighty)).toBe(80);
    expect(countGraphemes(eightyOne)).toBe(81);

    const accepted = await request(app)
      .patch(`/api/v1/conversations/${IDLE_ID}`)
      .send({ title: eighty });
    expect(accepted.status).toBe(200);
    expect(accepted.body.title).toBe(eighty);

    const rejected = await request(app)
      .patch(`/api/v1/conversations/${IDLE_ID}`)
      .send({ title: eightyOne });
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');
    await expect(storedTitle(pool, IDLE_ID)).resolves.toBe(eighty);
  });

  it('allows rename during busy but rejects delete without losing any rows', async () => {
    const snapshotsBefore = await deploymentRows(pool, BUSY_ID);
    const renamed = await request(app)
      .patch(`/api/v1/conversations/${BUSY_ID}`)
      .send({ title: 'Busy renombrada' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ title: 'Busy renombrada', hasWorkInProgress: true });

    const deleted = await request(app).delete(`/api/v1/conversations/${BUSY_ID}`);
    expect(deleted.status).toBe(409);
    expect(deleted.body.code).toBe('CONVERSATION_BUSY');
    await expect(rowCounts(pool, BUSY_ID)).resolves.toEqual({
      conversations: 1,
      deployments: 4,
      turns: 1,
      responses: 4,
    });
    expect(await deploymentRows(pool, BUSY_ID)).toEqual(snapshotsBefore);
  });

  it('deletes an idle conversation and cascades its turn and responses', async () => {
    const deleted = await request(app).delete(`/api/v1/conversations/${IDLE_ID}`);

    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    await expect(rowCounts(pool, IDLE_ID)).resolves.toEqual({
      conversations: 0,
      deployments: 0,
      turns: 0,
      responses: 0,
    });
  });

  it('translates invalid cursors, invalid titles and missing conversations safely', async () => {
    const invalidCursor = await request(app).get('/api/v1/conversations?cursor=bm90LWpzb24');
    expect(invalidCursor.status).toBe(400);
    expect(invalidCursor.body).toMatchObject({ code: 'INVALID_CURSOR' });

    const invalidTitle = await request(app)
      .patch(`/api/v1/conversations/${IDLE_ID}`)
      .send({ title: '   ' });
    expect(invalidTitle.status).toBe(422);
    expect(invalidTitle.body).toMatchObject({ code: 'VALIDATION_ERROR' });

    const replacement = await request(app)
      .patch(`/api/v1/conversations/${IDLE_ID}`)
      .send({ title: 'No replacement', deploymentIds: {} });
    expect(replacement.status).toBe(422);
    const deleteReplacement = await request(app)
      .delete(`/api/v1/conversations/${IDLE_ID}`)
      .send({ deploymentIds: {} });
    expect(deleteReplacement.status).toBe(422);
    await expect(rowCounts(pool, IDLE_ID)).resolves.toMatchObject({
      conversations: 1,
      deployments: 4,
    });

    for (const result of await Promise.all([
      request(app).get('/api/v1/conversations/91000000-0000-4000-8000-000000000099'),
      request(app)
        .patch('/api/v1/conversations/91000000-0000-4000-8000-000000000099')
        .send({ title: 'No existe' }),
      request(app).delete('/api/v1/conversations/91000000-0000-4000-8000-000000000099'),
    ])) {
      expect(result.status).toBe(404);
      expect(result.body.code).toBe('CONVERSATION_NOT_FOUND');
    }
    await expect(storedTitle(pool, IDLE_ID)).resolves.toBe('Conversación idle');
  });
});

async function seedConversation(
  pool: Pool,
  conversationId: string,
  status: 'completed' | 'running',
  title: string
): Promise<void> {
  const discriminator = conversationId === IDLE_ID ? '1' : '2';
  const turnId = `91100000-0000-4000-8000-00000000009${discriminator}`;
  await pool.query(
    `INSERT INTO conversations
       (id, create_client_request_id, title, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      conversationId,
      `91200000-0000-4000-8000-00000000009${discriminator}`,
      title,
      NOW,
      `2026-07-26T20:00:0${discriminator}.000Z`,
    ]
  );
  await insertConversationDeployments(pool, conversationId);
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 'Prompt', $4, $5, $5)`,
    [turnId, conversationId, `91300000-0000-4000-8000-00000000009${discriminator}`, status, NOW]
  );
  await pool.query(
    `INSERT INTO model_responses
       (id, turn_id, slot, role, provider, model, status, content, error_recoverable,
        is_stale, attempt_no, started_at, completed_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1, slot,
            CASE WHEN slot = 'consolidator' THEN 'consolidator' ELSE 'base' END,
            slot, slot || '-model', $2::varchar,
            CASE WHEN $2::varchar = 'completed' THEN slot || '-response' ELSE NULL END,
            false, false, 1, $3::timestamptz,
            CASE WHEN $2::varchar = 'completed' THEN $3::timestamptz ELSE NULL END,
            $3::timestamptz, $3::timestamptz
       FROM unnest(ARRAY['base-1', 'base-2', 'base-3', 'consolidator']) AS slot`,
    [turnId, status, NOW]
  );
}

async function storedTitle(pool: Pool, conversationId: string): Promise<string | undefined> {
  return (
    await pool.query<{ title: string }>('SELECT title FROM conversations WHERE id = $1', [
      conversationId,
    ])
  ).rows[0]?.title;
}

async function rowCounts(pool: Pool, conversationId: string) {
  const result = await pool.query<{
    conversations: number;
    deployments: number;
    turns: number;
    responses: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM conversations WHERE id = $1) AS conversations,
       (SELECT count(*)::int FROM conversation_deployments WHERE conversation_id = $1) AS deployments,
       (SELECT count(*)::int FROM turns WHERE conversation_id = $1) AS turns,
       (SELECT count(*)::int FROM model_responses mr JOIN turns t ON t.id = mr.turn_id
         WHERE t.conversation_id = $1) AS responses`,
    [conversationId]
  );
  return result.rows[0];
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

function countGraphemes(value: string): number {
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].length;
}
