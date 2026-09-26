import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import {
  mapConversationDeploymentRow,
  mapConversationDetail,
  mapConversationRow,
  mapModelResponseRow,
  mapTurnRow,
  orderDeploymentSnapshots,
  type ConversationDeploymentRow,
  type ConversationRow,
  type ModelResponseRow,
  type TurnRow,
} from '../mappers/conversationMapper.js';
import type {
  ConversationDetail,
  ConversationDeploymentSnapshotTuple,
  ConversationPage,
  ConversationSummary,
  TurnPage,
} from '../../../types/conversations.js';
import { decodeCursor, encodeCursor, InvalidCursorError } from '../../../utils/cursor.js';
import { withTransaction } from '../transaction.js';

interface CreateInput {
  clientRequestId: string;
  prompt: string;
  webSearchEnabled: boolean;
}

interface CreateConversationInput {
  clientRequestId: string;
  prompt: string;
  webSearchEnabled: boolean;
  title: string;
  deployments: ConversationDeploymentSnapshotTuple;
}

export type CreateResult =
  | {
      kind: 'created' | 'replay';
      conversationId: string;
      turnId: string;
      deployments: ConversationDeploymentSnapshotTuple;
    }
  | { kind: 'conflict' }
  | { kind: 'duplicate_deployment_assignment' };

export type CreateReplayResult =
  | {
      kind: 'replay';
      conversationId: string;
      turnId: string;
      deployments: ConversationDeploymentSnapshotTuple;
    }
  | { kind: 'conflict' }
  | null;

export type CreateTurnResult =
  | Exclude<CreateResult, { kind: 'duplicate_deployment_assignment' }>
  | { kind: 'conversation_not_found' | 'busy' };
export type DeleteConversationResult = 'deleted' | 'not_found' | 'busy';

interface ExistingTurnRow {
  id: string;
  conversation_id: string;
  user_content: string;
  web_search_enabled: boolean;
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

  findCreateReplay(
    clientRequestId: string,
    prompt: string,
    webSearchEnabled: boolean
  ): Promise<CreateReplayResult> {
    return withTransaction(
      this.pool,
      async client => {
        const existing = await client.query<ExistingTurnRow>(
          `SELECT t.id, t.conversation_id, t.user_content, t.web_search_enabled
             FROM conversations c
             JOIN turns t ON t.conversation_id = c.id AND t.ordinal = 1
            WHERE c.create_client_request_id = $1`,
          [clientRequestId]
        );
        const row = existing.rows[0];
        if (!row) return null;
        if (row.user_content !== prompt || row.web_search_enabled !== webSearchEnabled) {
          return { kind: 'conflict' };
        }
        return {
          kind: 'replay',
          conversationId: row.conversation_id,
          turnId: row.id,
          deployments: await this.requireDeployments(client, row.conversation_id, false),
        };
      },
      { isolationLevel: 'REPEATABLE READ', readOnly: true }
    );
  }

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
      [limit + 1, position?.updatedAt ?? null, position?.id ?? null]
    );
    const hasNext = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);

    return {
      items: rows.map(mapConversationRow),
      nextCursor:
        hasNext && last ? encodeCursor({ updatedAt: toIso(last.updated_at), id: last.id }) : null,
    };
  }

  async listTurns(conversationId: string, before?: string): Promise<TurnPage> {
    const position = before === undefined ? undefined : parseTurnCursor(before);
    const turnsResult = await this.pool.query<TurnRow>(
      `SELECT id, client_request_id, ordinal, user_content, web_search_enabled,
              status, created_at, updated_at
         FROM turns
        WHERE conversation_id = $1
          AND ($2::integer IS NULL OR (ordinal, id) < ($2::integer, $3::uuid))
        ORDER BY ordinal DESC, id DESC
        LIMIT $4`,
      [conversationId, position?.ordinal ?? null, position?.id ?? null, TURN_PAGE_SIZE + 1]
    );
    const hasOlder = turnsResult.rows.length > TURN_PAGE_SIZE;
    const rows = turnsResult.rows.slice(0, TURN_PAGE_SIZE).reverse();
    const responsesResult =
      rows.length === 0
        ? { rows: [] as ModelResponseRow[] }
        : await this.pool.query<ModelResponseRow>(
            `SELECT turn_id, slot, role, provider, model, status, content, error_code, error_message,
                  error_recoverable, continued_without_at, is_stale, attempt_no, metadata,
                  started_at, completed_at, created_at, updated_at
             FROM model_responses
            WHERE turn_id = ANY($1::uuid[])`,
            [rows.map(({ id }) => id)]
          );
    const oldest = rows[0];

    return {
      items: rows.map(turn =>
        mapTurnRow(
          turn,
          responsesResult.rows
            .filter(response => response.turn_id === turn.id)
            .map(mapModelResponseRow)
        )
      ),
      olderCursor:
        hasOlder && oldest ? encodeCursor({ ordinal: oldest.ordinal, id: oldest.id }) : null,
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
      [conversationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const deployments = await this.getConversationDeployments(conversationId);
    if (!deployments) throw new Error('Conversation deployment snapshot is incomplete');
    return mapConversationDetail(row, deployments);
  }

  async getConversationDeployments(
    conversationId: string
  ): Promise<ConversationDeploymentSnapshotTuple | null> {
    const result = await this.pool.query<ConversationDeploymentRow>(
      `SELECT slot, deployment_id, provider_id, model_id, display_name,
              supports_web_search, context_limit_tokens, max_output_tokens,
              input_modalities, output_modalities
         FROM conversation_deployments
        WHERE conversation_id = $1`,
      [conversationId]
    );
    return result.rows.length === 0
      ? null
      : orderDeploymentSnapshots(result.rows.map(mapConversationDeploymentRow));
  }

  async renameConversation(
    conversationId: string,
    title: string
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
      [conversationId, title]
    );
    return result.rows[0] ? mapConversationRow(result.rows[0]) : null;
  }

  deleteConversation(conversationId: string): Promise<DeleteConversationResult> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId]
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
        [conversationId]
      );
      if (work.rows[0]?.busy === true) return 'busy';

      await client.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      return 'deleted';
    });
  }

  async createConversation(input: CreateConversationInput): Promise<CreateResult> {
    try {
      return await withTransaction(this.pool, async client => {
        const conversationId = randomUUID();
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO conversations
             (id, create_client_request_id, title, created_at, updated_at)
           VALUES ($1, $2, $3, now(), now())
           ON CONFLICT (create_client_request_id) DO NOTHING
           RETURNING id`,
          [conversationId, input.clientRequestId, input.title]
        );

        if (inserted.rowCount === 0) {
          const existing = await client.query<ExistingTurnRow>(
            `SELECT t.id, t.conversation_id, t.user_content, t.web_search_enabled
               FROM conversations c
               JOIN turns t ON t.conversation_id = c.id AND t.ordinal = 1
              WHERE c.create_client_request_id = $1`,
            [input.clientRequestId]
          );
          const row = existing.rows[0];
          if (!row) throw new Error('Conversation replay row is incomplete');
          if (
            row.user_content !== input.prompt ||
            row.web_search_enabled !== input.webSearchEnabled
          ) {
            return { kind: 'conflict' };
          }
          return {
            kind: 'replay',
            conversationId: row.conversation_id,
            turnId: row.id,
            deployments: await this.requireDeployments(client, row.conversation_id, true),
          };
        }

        await this.insertDeployments(client, conversationId, input.deployments);
        const turnId = randomUUID();
        await this.insertTurn(client, {
          conversationId,
          turnId,
          ordinal: 1,
          clientRequestId: input.clientRequestId,
          prompt: input.prompt,
          webSearchEnabled: input.webSearchEnabled,
          deployments: input.deployments,
        });
        return { kind: 'created', conversationId, turnId, deployments: input.deployments };
      });
    } catch (error) {
      if (isDuplicateDeploymentAssignmentViolation(error)) {
        return { kind: 'duplicate_deployment_assignment' };
      }
      throw error;
    }
  }

  createTurn(conversationId: string, input: CreateInput): Promise<CreateTurnResult> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId]
      );
      if (conversation.rowCount === 0) return { kind: 'conversation_not_found' };
      const existing = await client.query<ExistingTurnRow>(
        `SELECT id, conversation_id, user_content, web_search_enabled
           FROM turns
          WHERE conversation_id = $1 AND client_request_id = $2`,
        [conversationId, input.clientRequestId]
      );
      const replay = existing.rows[0];
      if (replay) {
        if (
          replay.user_content !== input.prompt ||
          replay.web_search_enabled !== input.webSearchEnabled
        ) {
          return { kind: 'conflict' };
        }
        return {
          kind: 'replay',
          conversationId,
          turnId: replay.id,
          deployments: await this.requireDeployments(client, conversationId, true),
        };
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
        [conversationId]
      );
      if (work.rows[0]?.busy === true) return { kind: 'busy' };
      const deployments = await this.requireDeployments(client, conversationId, true);

      const ordinalResult = await client.query<{ ordinal: number }>(
        'SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal FROM turns WHERE conversation_id = $1',
        [conversationId]
      );
      const ordinal = ordinalResult.rows[0]?.ordinal;
      if (!ordinal) throw new Error('Unable to assign turn ordinal');

      const turnId = randomUUID();
      await this.insertTurn(client, { conversationId, turnId, ordinal, ...input, deployments });
      await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [
        conversationId,
      ]);
      return { kind: 'created', conversationId, turnId, deployments };
    });
  }

  private async insertTurn(
    client: PoolClient,
    input: CreateInput & {
      conversationId: string;
      turnId: string;
      ordinal: number;
      deployments: ConversationDeploymentSnapshotTuple;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO turns
         (id, conversation_id, client_request_id, ordinal, user_content, web_search_enabled,
          status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', now(), now())`,
      [
        input.turnId,
        input.conversationId,
        input.clientRequestId,
        input.ordinal,
        input.prompt,
        input.webSearchEnabled,
      ]
    );

    for (const deployment of input.deployments) {
      await client.query(
        `INSERT INTO model_responses
           (id, turn_id, slot, role, provider, model, status, error_recoverable,
            is_stale, attempt_no, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', false, false, 0, now(), now())`,
        [
          randomUUID(),
          input.turnId,
          deployment.slot,
          deployment.slot === 'consolidator' ? 'consolidator' : 'base',
          deployment.providerId,
          deployment.modelId,
        ]
      );
    }
  }

  private async insertDeployments(
    client: PoolClient,
    conversationId: string,
    deployments: ConversationDeploymentSnapshotTuple
  ): Promise<void> {
    for (const deployment of deployments) {
      await client.query(
        `INSERT INTO conversation_deployments
           (conversation_id, slot, deployment_id, provider_id, model_id, display_name,
            supports_web_search, context_limit_tokens, max_output_tokens,
            input_modalities, output_modalities, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())`,
        [
          conversationId,
          deployment.slot,
          deployment.deploymentId,
          deployment.providerId,
          deployment.modelId,
          deployment.displayName,
          deployment.supportsWebSearch,
          deployment.contextLimitTokens,
          deployment.maxOutputTokens ?? null,
          deployment.inputModalities,
          deployment.outputModalities,
        ]
      );
    }
  }

  private async requireDeployments(
    client: PoolClient,
    conversationId: string,
    lock: boolean
  ): Promise<ConversationDeploymentSnapshotTuple> {
    const result = await client.query<ConversationDeploymentRow>(
      `SELECT slot, deployment_id, provider_id, model_id, display_name,
              supports_web_search, context_limit_tokens, max_output_tokens,
              input_modalities, output_modalities
         FROM conversation_deployments
        WHERE conversation_id = $1
        ${lock ? 'FOR SHARE' : ''}`,
      [conversationId]
    );
    return orderDeploymentSnapshots(result.rows.map(mapConversationDeploymentRow));
  }
}

function isDuplicateDeploymentAssignmentViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'uq_conversation_deployments_conversation_deployment'
  );
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
