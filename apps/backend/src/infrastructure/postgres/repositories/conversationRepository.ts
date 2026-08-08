import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import {
  mapConversationRow,
  mapModelResponseRow,
  mapTurnRow,
  type ConversationRow,
  type ModelResponseRow,
  type TurnRow,
} from '../mappers/conversationMapper.js';
import type {
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
  ResponseRole,
  ResponseSlot,
  TurnPage,
} from '../../../types/conversations.js';
import { decodeCursor, encodeCursor, InvalidCursorError } from '../../../utils/cursor.js';
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
export type DeleteConversationResult = 'deleted' | 'not_found' | 'busy';

interface ExistingTurnRow {
  id: string;
  conversation_id: string;
  user_content: string;
}

interface SidebarCursor {
  updatedAt: string;
  id: string;
}

interface TurnCursor {
  ordinal: number;
  id: string;
}

const TURN_PAGE_SIZE = 3;

export class ConversationRepository {
  constructor(private readonly pool: Pool) {}

  async listConversations(limit: number, cursor?: string): Promise<ConversationPage> {
    const position = cursor === undefined ? undefined : parseSidebarCursor(cursor);
    const result = await this.pool.query<ConversationRow>(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (EXISTS (
                 SELECT 1 FROM turns active_turn
                  WHERE active_turn.conversation_id = c.id
                    AND active_turn.status IN ('pending', 'running')
               ) OR EXISTS (
                 SELECT 1 FROM model_responses active_response
                 JOIN turns response_turn ON response_turn.id = active_response.turn_id
                  WHERE response_turn.conversation_id = c.id
                    AND active_response.status IN ('pending', 'running')
               )) AS has_work_in_progress
         FROM conversations c
        WHERE ($2::timestamptz IS NULL OR (c.updated_at, c.id) < ($2::timestamptz, $3::uuid))
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT $1`,
      [limit + 1, position?.updatedAt ?? null, position?.id ?? null],
    );
    const hasNext = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);

    return {
      items: rows.map(mapConversationRow),
      nextCursor:
        hasNext && last
          ? encodeCursor({ updatedAt: toIso(last.updated_at), id: last.id })
          : null,
    };
  }

  async listTurns(conversationId: string, before?: string): Promise<TurnPage> {
    const position = before === undefined ? undefined : parseTurnCursor(before);
    const turnsResult = await this.pool.query<TurnRow>(
      `SELECT id, client_request_id, ordinal, user_content, status, created_at, updated_at
         FROM turns
        WHERE conversation_id = $1
          AND ($2::integer IS NULL OR (ordinal, id) < ($2::integer, $3::uuid))
        ORDER BY ordinal DESC, id DESC
        LIMIT $4`,
      [conversationId, position?.ordinal ?? null, position?.id ?? null, TURN_PAGE_SIZE + 1],
    );
    const hasOlder = turnsResult.rows.length > TURN_PAGE_SIZE;
    const rows = turnsResult.rows.slice(0, TURN_PAGE_SIZE).reverse();
    const responsesResult = rows.length === 0
      ? { rows: [] as ModelResponseRow[] }
      : await this.pool.query<ModelResponseRow>(
          `SELECT turn_id, slot, role, provider, model, status, content, error_code, error_message,
                  error_recoverable, continued_without_at, is_stale, attempt_no, metadata,
                  started_at, completed_at, created_at, updated_at
             FROM model_responses
            WHERE turn_id = ANY($1::uuid[])`,
          [rows.map(({ id }) => id)],
        );
    const oldest = rows[0];

    return {
      items: rows.map(turn =>
        mapTurnRow(
          turn,
          responsesResult.rows
            .filter(response => response.turn_id === turn.id)
            .map(mapModelResponseRow),
        ),
      ),
      olderCursor:
        hasOlder && oldest
          ? encodeCursor({ ordinal: oldest.ordinal, id: oldest.id })
          : null,
      hasOlder,
    };
  }

  async getConversation(conversationId: string): Promise<ConversationDetail | null> {
    const result = await this.pool.query<ConversationRow>(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (EXISTS (
                 SELECT 1 FROM turns active_turn
                  WHERE active_turn.conversation_id = c.id
                    AND active_turn.status IN ('pending', 'running')
               ) OR EXISTS (
                 SELECT 1 FROM model_responses active_response
                 JOIN turns response_turn ON response_turn.id = active_response.turn_id
                  WHERE response_turn.conversation_id = c.id
                    AND active_response.status IN ('pending', 'running')
               )) AS has_work_in_progress
         FROM conversations c
        WHERE c.id = $1`,
      [conversationId],
    );
    return result.rows[0] ? mapConversationRow(result.rows[0]) : null;
  }

  async renameConversation(
    conversationId: string,
    title: string,
  ): Promise<ConversationSummary | null> {
    const result = await this.pool.query<ConversationRow>(
      `UPDATE conversations c
          SET title = $2, updated_at = now()
        WHERE c.id = $1
      RETURNING c.id, c.title, c.created_at, c.updated_at,
                (EXISTS (
                   SELECT 1 FROM turns active_turn
                    WHERE active_turn.conversation_id = c.id
                      AND active_turn.status IN ('pending', 'running')
                 ) OR EXISTS (
                   SELECT 1 FROM model_responses active_response
                   JOIN turns response_turn ON response_turn.id = active_response.turn_id
                    WHERE response_turn.conversation_id = c.id
                      AND active_response.status IN ('pending', 'running')
                 )) AS has_work_in_progress`,
      [conversationId, title],
    );
    return result.rows[0] ? mapConversationRow(result.rows[0]) : null;
  }

  deleteConversation(conversationId: string): Promise<DeleteConversationResult> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId],
      );
      if (conversation.rowCount === 0) return 'not_found';

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
      if (work.rows[0]?.busy === true) return 'busy';

      await client.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      return 'deleted';
    });
  }

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

function parseSidebarCursor(cursor: string): SidebarCursor {
  const payload = decodeCursor(cursor);
  if (
    Object.keys(payload).length !== 2 ||
    typeof payload.updatedAt !== 'string' ||
    !isIsoDateTime(payload.updatedAt) ||
    typeof payload.id !== 'string' ||
    !isUuid(payload.id)
  ) {
    throw new InvalidCursorError();
  }
  return { updatedAt: payload.updatedAt, id: payload.id };
}

function parseTurnCursor(cursor: string): TurnCursor {
  const payload = decodeCursor(cursor);
  if (
    Object.keys(payload).length !== 2 ||
    !Number.isInteger(payload.ordinal) ||
    (payload.ordinal as number) < 1 ||
    typeof payload.id !== 'string' ||
    !isUuid(payload.id)
  ) {
    throw new InvalidCursorError();
  }
  return { ordinal: payload.ordinal as number, id: payload.id };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isIsoDateTime(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
