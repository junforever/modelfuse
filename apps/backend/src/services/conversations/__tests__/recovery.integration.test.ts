import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { recoverInterruptedTurns } from '../recoverInterruptedTurns.js';
import { createControlledProviders } from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversations,
  dropIntegrationSchema,
} from '../../../test/integration/testDatabase.js';
import {
  RECOVERY_FIXTURE_VERSION,
  recoveryCases,
  type RecoveryResponseCase,
  type RecoveryTurnCase,
} from './fixtures/recoveryCases.js';

const OWNED_IDS = recoveryCases.map(({ id }) => id);
const FIXTURE_TIME = '2026-07-27T12:00:00.000Z';

describe(`startup recovery PostgreSQL integration fixture v${RECOVERY_FIXTURE_VERSION}`, () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool({ schema: 'recovery' });
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversations(pool, OWNED_IDS);
    await seedRecoveryCases(pool);
  });

  afterEach(async () => {
    await deleteOwnedConversations(pool, OWNED_IDS);
  });

  afterAll(async () => {
    await dropIntegrationSchema(pool);
    await pool?.end();
  });

  it('recovers every interrupted slot while preserving order and attribution for later queries', async () => {
    const providers = createControlledProviders();

    await recoverInterruptedTurns(pool);
    const recreated = createIntegrationBackend(pool, providers);

    for (const recoveryCase of recoveryCases) {
      const detail = await request(recreated.app).get(`/api/v1/conversations/${recoveryCase.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        id: recoveryCase.id,
        title: recoveryCase.title,
        hasWorkInProgress: false,
      });

      const history = await request(recreated.app).get(
        `/api/v1/conversations/${recoveryCase.id}/turns`,
      );
      expect(history.status).toBe(200);
      expect(history.body).toMatchObject({ hasOlder: false, olderCursor: null });
      expect(
        history.body.items.map(({ id, ordinal }: { id: string; ordinal: number }) => ({
          id,
          ordinal,
        })),
      ).toEqual(recoveryCase.turns.map(({ id, ordinal }) => ({ id, ordinal })));

      for (const expectedTurn of recoveryCase.turns) {
        const actualTurn = history.body.items.find(
          ({ id }: { id: string }) => id === expectedTurn.id,
        );
        expect(actualTurn).toMatchObject({
          id: expectedTurn.id,
          clientRequestId: expectedTurn.clientRequestId,
          ordinal: expectedTurn.ordinal,
          prompt: expectedTurn.prompt,
          status: expectedTurn.expectedStatus,
        });
        expect(actualTurn.responses.map(({ slot }: { slot: string }) => slot)).toEqual([
          'openai',
          'google',
          'minimax',
          'qwen',
        ]);

        for (const expectedResponse of expectedTurn.responses) {
          const actualResponse = actualTurn.responses.find(
            ({ slot }: { slot: string }) => slot === expectedResponse.slot,
          );
          expect(actualResponse).toMatchObject(expectedResponseAfterRecovery(expectedResponse));
        }
      }
    }

    expect(Object.values(providers).flatMap(({ calls }) => calls)).toEqual([]);
  });
});

async function seedRecoveryCases(pool: Pool): Promise<void> {
  for (const recoveryCase of recoveryCases) {
    await pool.query(
      `INSERT INTO conversations
         (id, create_client_request_id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [recoveryCase.id, recoveryCase.clientRequestId, recoveryCase.title, FIXTURE_TIME],
    );

    for (const turn of recoveryCase.turns) {
      await seedTurn(pool, recoveryCase.id, turn);
    }
  }
}

async function seedTurn(
  pool: Pool,
  conversationId: string,
  turn: RecoveryTurnCase,
): Promise<void> {
  await pool.query(
    `INSERT INTO turns
       (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [
      turn.id,
      conversationId,
      turn.clientRequestId,
      turn.ordinal,
      turn.prompt,
      turn.status,
      FIXTURE_TIME,
    ],
  );

  for (const response of turn.responses) {
    await pool.query(
      `INSERT INTO model_responses
         (id, turn_id, slot, role, provider, model, status, content, error_code,
          error_message, error_recoverable, is_stale, attempt_no, started_at,
          completed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, 1, $12, $13, $14, $14)`,
      [
        response.id,
        turn.id,
        response.slot,
        response.slot === 'qwen' ? 'consolidator' : 'base',
        `${response.slot}-fixture-provider`,
        `${response.slot}-fixture-model`,
        response.status,
        response.content,
        response.errorCode ?? null,
        response.errorCode ? 'Existing safe provider failure.' : null,
        response.recoverable ?? null,
        response.status === 'running' ? FIXTURE_TIME : null,
        response.status === 'completed' || response.status === 'failed' ? FIXTURE_TIME : null,
        FIXTURE_TIME,
      ],
    );
  }
}

function expectedResponseAfterRecovery(response: RecoveryResponseCase) {
  const interrupted = response.status === 'pending' || response.status === 'running';
  return {
    slot: response.slot,
    role: response.slot === 'qwen' ? 'consolidator' : 'base',
    provider: `${response.slot}-fixture-provider`,
    model: `${response.slot}-fixture-model`,
    status: interrupted ? 'failed' : response.status,
    content: response.content,
    error: interrupted
      ? { code: 'interrupted', message: expect.any(String) }
      : response.errorCode
        ? { code: response.errorCode, message: 'Existing safe provider failure.' }
        : null,
    recoverable: interrupted ? true : response.recoverable === true,
  };
}
