import type { Pool } from 'pg';

import type { BaseResponseSlot, ResponseSlot } from '../../../types/conversations.js';

export interface ContextTurn {
  ordinal: number;
  prompt: string;
  response: string | null;
}

interface ContextTurnRow {
  ordinal: number;
  prompt: string;
  response: string | null;
}

export class ContextRepository {
  constructor(private readonly pool: Pool) {}

  getBaseContext(input: {
    conversationId: string;
    beforeOrdinal: number;
    slot: BaseResponseSlot;
    maxTurns: number;
  }): Promise<ContextTurn[]> {
    return this.getContext(input, false);
  }

  getConsolidatorContext(input: {
    conversationId: string;
    beforeOrdinal: number;
    maxTurns: number;
  }): Promise<ContextTurn[]> {
    return this.getContext({ ...input, slot: 'consolidator' }, true);
  }

  private async getContext(
    input: {
      conversationId: string;
      beforeOrdinal: number;
      slot: ResponseSlot;
      maxTurns: number;
    },
    excludeStale: boolean,
  ): Promise<ContextTurn[]> {
    const result = await this.pool.query<ContextTurnRow>(
      `SELECT recent.ordinal, recent.user_content AS prompt, response.content AS response
         FROM (
           SELECT id, ordinal, user_content
             FROM turns
            WHERE conversation_id = $1 AND ordinal < $2
            ORDER BY ordinal DESC
            LIMIT $4
         ) recent
         LEFT JOIN model_responses response
           ON response.turn_id = recent.id
          AND response.slot = $3
          AND response.status = 'completed'
          AND ($5::boolean = false OR response.is_stale = false)
        ORDER BY recent.ordinal`,
      [
        input.conversationId,
        input.beforeOrdinal,
        input.slot,
        input.maxTurns,
        excludeStale,
      ],
    );
    return result.rows;
  }
}
