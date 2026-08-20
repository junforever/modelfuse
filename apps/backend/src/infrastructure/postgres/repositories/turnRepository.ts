import type { Pool, PoolClient } from 'pg';

import {
  mapConversationDeploymentRow,
  mapConversationRow,
  mapModelResponseRow,
  mapTurnRow,
  orderDeploymentSnapshots,
  type ConversationDeploymentRow,
  type ConversationRow,
  type ModelResponseRow,
  type TurnRow,
} from '../mappers/conversationMapper.js';
import { withTransaction } from '../transaction.js';
import { calculateTurnState } from '../../../services/conversations/turnState.js';
import type {
  ConversationDeploymentSnapshotTuple,
  ConversationSummary,
  ModelResponse,
  ResponseSlot,
  Turn,
} from '../../../types/conversations.js';

type DatabaseClient = Pool | PoolClient;

export interface StoredTurnSnapshot {
  conversation: ConversationSummary;
  deployments: ConversationDeploymentSnapshotTuple;
  turn: Turn;
}

export interface ReconciledTurn {
  snapshot: StoredTurnSnapshot;
  slots: ResponseSlot[];
}

export interface PersistResponseAttemptInput {
  turnId: string;
  slot: ResponseSlot;
  attemptNo: number;
  status: 'completed' | 'failed';
  content?: string;
  errorCode?: string;
  errorMessage?: string;
  errorRecoverable?: boolean;
  metadata?: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
  reconsolidateConsolidator?: boolean;
}

export type RetryPreparation =
  | { kind: 'accepted'; attemptNo: number; snapshot: StoredTurnSnapshot }
  | { kind: 'conversation_not_found' | 'response_not_found' }
  | { kind: 'conversation_busy' | 'retry_in_progress' | 'not_retryable' };

export type ContinueWithoutResult =
  | { kind: 'accepted'; snapshot: StoredTurnSnapshot }
  | { kind: 'conversation_not_found' | 'response_not_found' | 'not_allowed' };

interface ResponseStateRow {
  status: string;
  role: string;
  error_recoverable: boolean | null;
  continued_without_at: Date | null;
  attempt_no: number;
}

export class TurnRepository {
  constructor(private readonly pool: Pool) {}

  getTurnSnapshot(conversationId: string, turnId: string): Promise<StoredTurnSnapshot | null> {
    return withTransaction(
      this.pool,
      client => this.readSnapshot(client, conversationId, turnId),
      { isolationLevel: 'REPEATABLE READ', readOnly: true },
    );
  }

  startResponseAttempt(input: {
    conversationId: string;
    turnId: string;
    slot: ResponseSlot;
  }): Promise<{ attemptNo: number; snapshot: StoredTurnSnapshot } | null> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [input.conversationId],
      );
      if (conversation.rowCount === 0) return null;

      const started = await client.query<{ attempt_no: number }>(
        `UPDATE model_responses mr
            SET status = 'running',
                attempt_no = CASE WHEN attempt_no = 0 THEN 1 ELSE attempt_no END,
                started_at = now(), completed_at = NULL, updated_at = now()
           FROM turns t
          WHERE mr.turn_id = t.id
            AND t.conversation_id = $1
            AND mr.turn_id = $2
            AND mr.slot = $3
            AND mr.status = 'pending'
          RETURNING mr.attempt_no`,
        [input.conversationId, input.turnId, input.slot],
      );
      const row = started.rows[0];
      if (!row) return null;

      await this.recalculateTurnWith(client, input.conversationId, input.turnId);
      const snapshot = await this.requireSnapshot(client, input.conversationId, input.turnId);
      return { attemptNo: row.attempt_no, snapshot };
    });
  }

  persistResponseAttempt(input: PersistResponseAttemptInput): Promise<StoredTurnSnapshot | null> {
    return withTransaction(this.pool, async client => {
      const conversationId = await this.lockConversationForTurn(client, input.turnId);
      if (!conversationId) return null;

      const persisted = await client.query(
        `UPDATE model_responses
            SET status = $4::varchar,
                content = CASE
                  WHEN $4::varchar = 'completed' THEN $5::text
                  WHEN slot = 'consolidator' AND is_stale THEN content
                  ELSE NULL
                END,
                error_code = $6,
                error_message = $7,
                error_recoverable = $8,
                metadata = $9::jsonb,
                started_at = $10,
                completed_at = $11,
                is_stale = CASE WHEN slot = 'consolidator' AND $4::varchar = 'completed' THEN false ELSE is_stale END,
                updated_at = now()
          WHERE turn_id = $1 AND slot = $2 AND attempt_no = $3 AND status = 'running'`,
        [
          input.turnId,
          input.slot,
          input.attemptNo,
          input.status,
          input.content ?? null,
          input.errorCode ?? null,
          input.errorMessage ?? null,
          input.errorRecoverable ?? false,
          JSON.stringify(input.metadata ?? {}),
          input.startedAt,
          input.completedAt,
        ],
      );
      if (persisted.rowCount === 0) return null;

      if (input.reconsolidateConsolidator === true && input.status === 'completed') {
        await client.query(
          `UPDATE model_responses
              SET status = 'pending', attempt_no = attempt_no + 1,
                  is_stale = content IS NOT NULL,
                  error_code = NULL, error_message = NULL, error_recoverable = NULL,
                  started_at = NULL, completed_at = NULL, updated_at = now()
            WHERE turn_id = $1 AND slot = 'consolidator' AND status NOT IN ('pending', 'running')`,
          [input.turnId],
        );
      }

      await this.recalculateTurnWith(client, conversationId, input.turnId);
      return this.requireSnapshot(client, conversationId, input.turnId);
    });
  }

  recalculateTurn(turnId: string): Promise<StoredTurnSnapshot | null> {
    return withTransaction(this.pool, async client => {
      const conversationId = await this.lockConversationForTurn(client, turnId);
      if (!conversationId) return null;
      await this.recalculateTurnWith(client, conversationId, turnId);
      return this.requireSnapshot(client, conversationId, turnId);
    });
  }

  reconcileInterruptedTurn(conversationId: string, turnId: string): Promise<ReconciledTurn | null> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId],
      );
      if (conversation.rowCount === 0) return null;

      const reconciled = await client.query<{ slot: ResponseSlot }>(
        `UPDATE model_responses mr
            SET status = 'failed',
                content = CASE WHEN slot = 'consolidator' AND is_stale THEN content ELSE NULL END,
                error_code = 'interrupted',
                error_message = 'The response was interrupted before completion.',
                error_recoverable = true,
                metadata = '{}'::jsonb,
                completed_at = now(),
                updated_at = now()
           FROM turns t
          WHERE mr.turn_id = t.id
            AND t.conversation_id = $1
            AND mr.turn_id = $2
            AND mr.status IN ('pending', 'running')
        RETURNING mr.slot`,
        [conversationId, turnId],
      );
      if (reconciled.rowCount === 0) return null;

      await this.recalculateTurnWith(client, conversationId, turnId);
      return {
        snapshot: await this.requireSnapshot(client, conversationId, turnId),
        slots: reconciled.rows.map(({ slot }) => slot),
      };
    });
  }

  prepareRetry(
    conversationId: string,
    turnId: string,
    slot: ResponseSlot,
  ): Promise<RetryPreparation> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId],
      );
      if (conversation.rowCount === 0) return { kind: 'conversation_not_found' };

      const response = await client.query<ResponseStateRow>(
        `SELECT mr.status, mr.role, mr.error_recoverable, mr.continued_without_at, mr.attempt_no
           FROM model_responses mr
           JOIN turns t ON t.id = mr.turn_id
          WHERE t.conversation_id = $1 AND t.id = $2 AND mr.slot = $3
          FOR UPDATE OF mr`,
        [conversationId, turnId, slot],
      );
      const state = response.rows[0];
      if (!state) return { kind: 'response_not_found' };

      const otherTurnBusy = await client.query<{ busy: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM turns
            WHERE conversation_id = $1 AND id <> $2 AND status IN ('pending', 'running')
         ) OR EXISTS (
           SELECT 1 FROM model_responses mr
           JOIN turns t ON t.id = mr.turn_id
            WHERE t.conversation_id = $1 AND t.id <> $2
              AND mr.status IN ('pending', 'running')
         ) AS busy`,
        [conversationId, turnId],
      );
      if (otherTurnBusy.rows[0]?.busy === true) return { kind: 'conversation_busy' };
      if (state.status === 'pending' || state.status === 'running') {
        return { kind: 'retry_in_progress' };
      }
      if (
        state.status !== 'failed' ||
        state.error_recoverable !== true ||
        state.continued_without_at !== null
      ) {
        return { kind: 'not_retryable' };
      }

      const accepted = await client.query<{ attempt_no: number }>(
        `UPDATE model_responses
            SET status = 'pending', attempt_no = attempt_no + 1,
                error_code = NULL, error_message = NULL, error_recoverable = NULL,
                started_at = NULL, completed_at = NULL, updated_at = now()
          WHERE turn_id = $1 AND slot = $2
            AND status = 'failed' AND error_recoverable = true
            AND continued_without_at IS NULL
          RETURNING attempt_no`,
        [turnId, slot],
      );
      const acceptedRow = accepted.rows[0];
      if (!acceptedRow) return { kind: 'retry_in_progress' };

      await client.query(
        "UPDATE turns SET status = 'running', updated_at = now() WHERE id = $1",
        [turnId],
      );
      await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [conversationId]);
      const snapshot = await this.requireSnapshot(client, conversationId, turnId);
      return { kind: 'accepted', attemptNo: acceptedRow.attempt_no, snapshot };
    });
  }

  continueWithout(
    conversationId: string,
    turnId: string,
    slot: ResponseSlot,
  ): Promise<ContinueWithoutResult> {
    return withTransaction(this.pool, async client => {
      const conversation = await client.query<{ id: string }>(
        'SELECT id FROM conversations WHERE id = $1 FOR UPDATE',
        [conversationId],
      );
      if (conversation.rowCount === 0) return { kind: 'conversation_not_found' };

      const response = await client.query<ResponseStateRow>(
        `SELECT mr.status, mr.role, mr.error_recoverable, mr.continued_without_at, mr.attempt_no
           FROM model_responses mr
           JOIN turns t ON t.id = mr.turn_id
          WHERE t.conversation_id = $1 AND t.id = $2 AND mr.slot = $3
          FOR UPDATE OF mr`,
        [conversationId, turnId, slot],
      );
      const state = response.rows[0];
      if (!state) return { kind: 'response_not_found' };
      if (state.role !== 'base' || state.status !== 'failed') return { kind: 'not_allowed' };

      if (state.continued_without_at === null) {
        await client.query(
          `UPDATE model_responses
              SET continued_without_at = now(), updated_at = now()
            WHERE turn_id = $1 AND slot = $2`,
          [turnId, slot],
        );
      }
      const snapshot = await this.requireSnapshot(client, conversationId, turnId);
      return { kind: 'accepted', snapshot };
    });
  }

  async getAvailableBaseResponses(turnId: string): Promise<ModelResponse[]> {
    const rows = await this.pool.query<ModelResponseRow>(
      `SELECT slot, role, provider, model, status, content, error_code, error_message,
              error_recoverable, continued_without_at, is_stale, attempt_no, metadata,
              started_at, completed_at, created_at, updated_at
         FROM model_responses
        WHERE turn_id = $1 AND role = 'base' AND status = 'completed'
        ORDER BY CASE slot WHEN 'base-1' THEN 1 WHEN 'base-2' THEN 2 ELSE 3 END`,
      [turnId],
    );
    return rows.rows.map(mapModelResponseRow);
  }

  private async recalculateTurnWith(
    client: PoolClient,
    conversationId: string,
    turnId: string,
  ): Promise<void> {
    const turn = await client.query<{ id: string }>(
      'SELECT id FROM turns WHERE id = $1 AND conversation_id = $2 FOR UPDATE',
      [turnId, conversationId],
    );
    if (turn.rowCount === 0) throw new Error('Turn disappeared during state transition');

    const responses = await client.query<Pick<ModelResponseRow, 'slot' | 'status' | 'is_stale'>>(
      'SELECT slot, status, is_stale FROM model_responses WHERE turn_id = $1',
      [turnId],
    );
    const state = calculateTurnState(responses.rows);
    await client.query('UPDATE turns SET status = $2, updated_at = now() WHERE id = $1', [turnId, state.status]);
    await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [conversationId]);
  }

  private async lockConversationForTurn(
    client: PoolClient,
    turnId: string,
  ): Promise<string | null> {
    const conversation = await client.query<{ id: string }>(
      `SELECT conversation.id
         FROM conversations conversation
         JOIN turns turn_row ON turn_row.conversation_id = conversation.id
        WHERE turn_row.id = $1
        FOR UPDATE OF conversation`,
      [turnId],
    );
    return conversation.rows[0]?.id ?? null;
  }

  private async requireSnapshot(
    client: DatabaseClient,
    conversationId: string,
    turnId: string,
  ): Promise<StoredTurnSnapshot> {
    const snapshot = await this.readSnapshot(client, conversationId, turnId);
    if (!snapshot) throw new Error('Committed turn snapshot is unavailable');
    return snapshot;
  }

  private async readSnapshot(
    client: DatabaseClient,
    conversationId: string,
    turnId: string,
  ): Promise<StoredTurnSnapshot | null> {
    const conversations = await client.query<ConversationRow>(
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
         JOIN turns owned_turn ON owned_turn.conversation_id = c.id
        WHERE c.id = $1 AND owned_turn.id = $2`,
      [conversationId, turnId],
    );
    const conversation = conversations.rows[0];
    if (!conversation) return null;

    const turns = await client.query<TurnRow>(
      `SELECT id, client_request_id, ordinal, user_content, status, created_at, updated_at
         FROM turns WHERE id = $1 AND conversation_id = $2`,
      [turnId, conversationId],
    );
    const turn = turns.rows[0];
    if (!turn) return null;

    const responses = await client.query<ModelResponseRow>(
      `SELECT slot, role, provider, model, status, content, error_code, error_message,
              error_recoverable, continued_without_at, is_stale, attempt_no, metadata,
              started_at, completed_at, created_at, updated_at
         FROM model_responses WHERE turn_id = $1`,
      [turnId],
    );
    const deployments = await client.query<ConversationDeploymentRow>(
      `SELECT slot, deployment_id, provider_id, model_id, display_name,
              context_limit_tokens, max_output_tokens, input_modalities, output_modalities
         FROM conversation_deployments
        WHERE conversation_id = $1`,
      [conversationId],
    );
    return {
      conversation: mapConversationRow(conversation),
      deployments: orderDeploymentSnapshots(
        deployments.rows.map(mapConversationDeploymentRow),
      ),
      turn: mapTurnRow(turn, responses.rows.map(mapModelResponseRow)),
    };
  }
}
