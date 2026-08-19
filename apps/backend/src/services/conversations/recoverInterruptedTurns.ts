import type { Pool } from 'pg';

import { withTransaction } from '../../infrastructure/postgres/transaction.js';
import type { ResponseSlot, ResponseStatus } from '../../types/conversations.js';
import { logger } from '../../utils/logger.js';
import { calculateTurnState, type TurnSlotState } from './turnState.js';

interface RecoveredResponseRow {
  turn_id: string;
  slot: ResponseSlot;
}

interface ResponseStateRow {
  turn_id: string;
  slot: ResponseSlot;
  status: ResponseStatus;
  is_stale: boolean;
}

export async function recoverInterruptedTurns(pool: Pool): Promise<void> {
  const recovered = await withTransaction(pool, async client => {
    const responses = await client.query<RecoveredResponseRow>(
      `UPDATE model_responses
          SET status = 'failed',
              content = CASE WHEN slot = 'qwen' AND is_stale THEN content ELSE NULL END,
              error_code = 'interrupted',
              error_message = 'The response was interrupted before completion.',
              error_recoverable = true,
              metadata = '{}'::jsonb,
              completed_at = now(),
              updated_at = now()
        WHERE status IN ('pending', 'running')
      RETURNING turn_id, slot`,
    );
    const turnIds = [...new Set(responses.rows.map(({ turn_id }) => turn_id))];
    if (turnIds.length === 0) return { responseCount: 0, turnIds };

    const responseStates = await client.query<ResponseStateRow>(
      `SELECT turn_id, slot, status, is_stale
         FROM model_responses
        WHERE turn_id = ANY($1::uuid[])`,
      [turnIds],
    );
    const statesByTurn = new Map<string, TurnSlotState[]>();
    for (const response of responseStates.rows) {
      const states = statesByTurn.get(response.turn_id) ?? [];
      states.push({
        slot: response.slot,
        status: response.status,
        isStale: response.is_stale,
      });
      statesByTurn.set(response.turn_id, states);
    }

    const conversationIds = new Set<string>();
    for (const turnId of turnIds) {
      const state = calculateTurnState(statesByTurn.get(turnId) ?? []);
      const updated = await client.query<{ conversation_id: string }>(
        `UPDATE turns
            SET status = $2, updated_at = now()
          WHERE id = $1
        RETURNING conversation_id`,
        [turnId, state.status],
      );
      const conversationId = updated.rows[0]?.conversation_id;
      if (!conversationId) throw new Error('Interrupted turn disappeared during recovery');
      conversationIds.add(conversationId);
    }

    await client.query(
      'UPDATE conversations SET updated_at = now() WHERE id = ANY($1::uuid[])',
      [[...conversationIds]],
    );
    return { responseCount: responses.rowCount ?? responses.rows.length, turnIds };
  });

  logger.info({
    message: 'Interrupted turn recovery completed',
    operation: 'recovery_completed',
    recoveredResponseCount: recovered.responseCount,
    recoveredTurnCount: recovered.turnIds.length,
    turnIds: recovered.turnIds,
  });
}
