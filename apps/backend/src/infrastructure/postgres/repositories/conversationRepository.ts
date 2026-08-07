import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import type { ResponseRole, ResponseSlot } from '../../../types/conversations.js';
import { withTransaction } from '../transaction.js';

export interface ResponseDefinition {
  slot: ResponseSlot;
  role: ResponseRole;
  provider: string;
  model: string;
}

interface CreateInput {
  clientRequestId: string;
  prompt: string;
  responses: readonly ResponseDefinition[];
}

interface CreateConversationInput extends CreateInput {
  title: string;
}

export type CreateResult =
  | { kind: 'created'; conversationId: string; turnId: string }
  | { kind: 'replay'; conversationId: string; turnId: string }
  | { kind: 'conflict' };

export type CreateTurnResult = CreateResult | { kind: 'conversation_not_found' | 'busy' };

interface ExistingTurnRow {
  id: string;
  conversation_id: string;
  user_content: string;
}

export class ConversationRepository {
  constructor(private readonly pool: Pool) {}

  createConversation(input: CreateConversationInput): Promise<CreateResult> {
    return withTransaction(this.pool, async client => {
      const conversationId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO conversations
           (id, create_client_request_id, title, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())
         ON CONFLICT (create_client_request_id) DO NOTHING
         RETURNING id`,
        [conversationId, input.clientRequestId, input.title],
      );

      if (inserted.rowCount === 0) {
        const existing = await client.query<ExistingTurnRow>(
          `SELECT t.id, t.conversation_id, t.user_content
             FROM conversations c
             JOIN turns t ON t.conversation_id = c.id AND t.ordinal = 1
            WHERE c.create_client_request_id = $1`,
          [input.clientRequestId],
        );
        const row = existing.rows[0];
        if (!row) throw new Error('Conversation replay row is incomplete');
        return row.user_content === input.prompt
          ? { kind: 'replay', conversationId: row.conversation_id, turnId: row.id }
          : { kind: 'conflict' };
      }

      const turnId = randomUUID();
      await this.insertTurn(client, {
        conversationId,
        turnId,
        ordinal: 1,
        ...input,
      });
      return { kind: 'created', conversationId, turnId };
    });
  }

  createTurn(conversationId: string, input: CreateInput): Promise<CreateTurnResult> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId],
      );
      if (conversation.rowCount === 0) return { kind: 'conversation_not_found' };

      const existing = await client.query<ExistingTurnRow>(
        `SELECT id, conversation_id, user_content
           FROM turns
          WHERE conversation_id = $1 AND client_request_id = $2`,
        [conversationId, input.clientRequestId],
      );
      const replay = existing.rows[0];
      if (replay) {
        return replay.user_content === input.prompt
          ? { kind: 'replay', conversationId, turnId: replay.id }
          : { kind: 'conflict' };
      }

      const work = await client.query<{ busy: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM turns
            WHERE conversation_id = $1 AND status IN ('pending', 'running')
         ) OR EXISTS (
           SELECT 1 FROM model_responses response
           JOIN turns turn_row ON turn_row.id = response.turn_id
            WHERE turn_row.conversation_id = $1
              AND response.status IN ('pending', 'running')
         ) AS busy`,
        [conversationId],
      );
      if (work.rows[0]?.busy === true) return { kind: 'busy' };

      const ordinalResult = await client.query<{ ordinal: number }>(
        'SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal FROM turns WHERE conversation_id = $1',
        [conversationId],
      );
      const ordinal = ordinalResult.rows[0]?.ordinal;
      if (!ordinal) throw new Error('Unable to assign turn ordinal');

      const turnId = randomUUID();
      await this.insertTurn(client, { conversationId, turnId, ordinal, ...input });
      await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [conversationId]);
      return { kind: 'created', conversationId, turnId };
    });
  }

  private async insertTurn(
    client: PoolClient,
    input: CreateInput & { conversationId: string; turnId: string; ordinal: number },
  ): Promise<void> {
    await client.query(
      `INSERT INTO turns
         (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())`,
      [input.turnId, input.conversationId, input.clientRequestId, input.ordinal, input.prompt],
    );

    for (const response of input.responses) {
      await client.query(
        `INSERT INTO model_responses
           (id, turn_id, slot, role, provider, model, status, error_recoverable,
            is_stale, attempt_no, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', false, false, 0, now(), now())`,
        [randomUUID(), input.turnId, response.slot, response.role, response.provider, response.model],
      );
    }
  }
}
