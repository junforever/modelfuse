import { describe, expect, it } from 'vitest';

import {
  mapConversationRow,
  mapModelResponseRow,
  mapTurnRow,
} from '../conversationMapper.js';

describe('conversationMapper', () => {
  it('maps exactly four PostgreSQL slots to the ordered REST contract without internal data', () => {
    const createdAt = new Date('2026-08-06T12:00:00.000Z');
    const updatedAt = new Date('2026-08-06T12:00:01.000Z');
    const turnRow = {
      id: 'turn-id',
      conversation_id: 'conversation-id',
      client_request_id: '11111111-1111-4111-8111-111111111111',
      ordinal: 1,
      user_content: 'Compara estas respuestas',
      status: 'completed' as const,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    const responseRow = (slot: 'openai' | 'google' | 'minimax' | 'qwen') => ({
      id: `${slot}-response-id`,
      turn_id: 'turn-id',
      slot,
      role: slot === 'qwen' ? ('consolidator' as const) : ('base' as const),
      provider: slot,
      model: `${slot}-model`,
      status: 'completed' as const,
      content: `Respuesta ${slot}`,
      error_code: null,
      error_message: null,
      error_recoverable: false,
      continued_without_at: null,
      is_stale: false,
      attempt_no: 1,
      metadata: {
        durationMs: 820,
        contextWindow: {
          truncated: true,
          firstIncludedOrdinal: 4,
          lastIncludedOrdinal: 9,
          protectionApplied: 'turn-window-and-truncate',
        },
        measuredTokens: 1_234,
        contextLimitTokens: 8_192,
        thresholdTokens: 6_553,
      },
      started_at: createdAt,
      completed_at: updatedAt,
      created_at: createdAt,
      updated_at: updatedAt,
      api_key: 'must-not-leak',
      provider_request_body: { secret: 'must-not-leak' },
      raw_provider_response: { secret: 'must-not-leak' },
    });
    const responses = (['google', 'qwen', 'openai', 'minimax'] as const).map((slot) =>
      mapModelResponseRow(responseRow(slot)),
    );

    const turn = mapTurnRow(turnRow, responses);
    const conversation = mapConversationRow({
      id: 'conversation-id',
      create_client_request_id: '11111111-1111-4111-8111-111111111111',
      title: 'Compara estas respuestas',
      has_work_in_progress: false,
      created_at: createdAt,
      updated_at: updatedAt,
    });

    expect(conversation).toEqual({
      id: 'conversation-id',
      title: 'Compara estas respuestas',
      hasWorkInProgress: false,
      createdAt: '2026-08-06T12:00:00.000Z',
      updatedAt: '2026-08-06T12:00:01.000Z',
    });
    expect(turn).toMatchObject({
      id: 'turn-id',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      ordinal: 1,
      prompt: 'Compara estas respuestas',
      status: 'completed',
      createdAt: '2026-08-06T12:00:00.000Z',
      updatedAt: '2026-08-06T12:00:01.000Z',
    });
    expect(turn.responses.map(({ slot }) => slot)).toEqual([
      'openai',
      'google',
      'minimax',
      'qwen',
    ]);
    expect(turn.responses[0]).toEqual({
      slot: 'openai',
      role: 'base',
      provider: 'openai',
      model: 'openai-model',
      status: 'completed',
      content: 'Respuesta openai',
      error: null,
      recoverable: false,
      continuedWithout: false,
      isStale: false,
      attemptNo: 1,
      metadata: {
        durationMs: 820,
        contextWindow: {
          truncated: true,
          firstIncludedOrdinal: 4,
          lastIncludedOrdinal: 9,
          protectionApplied: 'turn-window-and-truncate',
        },
      },
      startedAt: '2026-08-06T12:00:00.000Z',
      completedAt: '2026-08-06T12:00:01.000Z',
      createdAt: '2026-08-06T12:00:00.000Z',
      updatedAt: '2026-08-06T12:00:01.000Z',
    });
    expect(() => mapTurnRow(turnRow, responses.slice(0, 3))).toThrow();
    expect(() => mapTurnRow(turnRow, [...responses.slice(0, 3), responses[0]])).toThrow();

    expect(JSON.stringify({ conversation, turn })).not.toMatch(
      /turn_id|conversation_id|api_key|provider_request_body|raw_provider_response|measuredTokens|contextLimitTokens|thresholdTokens|must-not-leak/,
    );
  });
});
