import { describe, expect, it } from 'vitest';

import {
  mapConversationDeploymentRow,
  mapConversationDetail,
  mapConversationRow,
  mapModelResponseRow,
  mapTurnRow,
  orderDeploymentSnapshots,
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
      web_search_enabled: true,
      status: 'completed' as const,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    const responseRow = (slot: 'base-1' | 'base-2' | 'base-3' | 'consolidator') => ({
      id: `${slot}-response-id`,
      turn_id: 'turn-id',
      slot,
      role: slot === 'consolidator' ? ('consolidator' as const) : ('base' as const),
      provider: `${slot}-provider`,
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
        citations: [
          { url: 'https://example.com/source', title: 'Verified source' },
          {
            url: 'https://embedded-user@example.com/private',
            title: 'Username-bearing source',
          },
          {
            url: 'https://embedded-user:embedded-password@example.com/private',
            title: 'Password-bearing source',
          },
        ],
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
    const responses = (['base-2', 'consolidator', 'base-1', 'base-3'] as const).map(slot =>
      mapModelResponseRow(responseRow(slot))
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
      webSearchEnabled: true,
      status: 'completed',
      createdAt: '2026-08-06T12:00:00.000Z',
      updatedAt: '2026-08-06T12:00:01.000Z',
    });
    expect(turn.responses.map(({ slot, role }) => ({ slot, role }))).toEqual([
      { slot: 'base-1', role: 'base' },
      { slot: 'base-2', role: 'base' },
      { slot: 'base-3', role: 'base' },
      { slot: 'consolidator', role: 'consolidator' },
    ]);
    expect(turn.responses[0]).toEqual({
      slot: 'base-1',
      role: 'base',
      provider: 'base-1-provider',
      model: 'base-1-model',
      status: 'completed',
      content: 'Respuesta base-1',
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
        citations: [{ url: 'https://example.com/source', title: 'Verified source' }],
      },
      startedAt: '2026-08-06T12:00:00.000Z',
      completedAt: '2026-08-06T12:00:01.000Z',
      createdAt: '2026-08-06T12:00:00.000Z',
      updatedAt: '2026-08-06T12:00:01.000Z',
    });
    expect(() => mapTurnRow(turnRow, responses.slice(0, 3))).toThrow();
    expect(() => mapTurnRow(turnRow, [...responses.slice(0, 3), responses[0]])).toThrow();

    expect(JSON.stringify({ conversation, turn })).not.toMatch(
      /turn_id|conversation_id|api_key|provider_request_body|raw_provider_response|measuredTokens|contextLimitTokens|thresholdTokens|must-not-leak/
    );
  });

  it('returns a safe public deployment summary in canonical slot order', () => {
    const createdAt = new Date('2026-08-20T12:00:00.000Z');
    const rows = (['consolidator', 'base-2', 'base-1', 'base-3'] as const).map((slot, index) => ({
      slot,
      deployment_id: `${slot}-deployment`,
      provider_id: index % 2 === 0 ? ('openrouter' as const) : ('openai' as const),
      model_id: `${slot}-model`,
      display_name: `${slot} display`,
      supports_web_search: index % 2 === 0,
      context_limit_tokens: 10_000 + index,
      max_output_tokens: 1_000 + index,
      input_modalities: ['text' as const],
      output_modalities: ['text' as const],
      credential_env: 'SECRET_MUST_NOT_LEAK',
      raw_provider_config: { apiKey: 'SECRET_MUST_NOT_LEAK' },
    }));
    const deployments = orderDeploymentSnapshots(rows.map(mapConversationDeploymentRow));
    const detail = mapConversationDetail(
      {
        id: 'conversation-id',
        title: 'Conversation',
        has_work_in_progress: false,
        created_at: createdAt,
        updated_at: createdAt,
      },
      deployments
    );

    expect(detail.deployments).toEqual([
      {
        slot: 'base-1',
        deploymentId: 'base-1-deployment',
        providerId: 'openrouter',
        modelId: 'base-1-model',
        displayName: 'base-1 display',
        supportsWebSearch: true,
      },
      {
        slot: 'base-2',
        deploymentId: 'base-2-deployment',
        providerId: 'openai',
        modelId: 'base-2-model',
        displayName: 'base-2 display',
        supportsWebSearch: false,
      },
      {
        slot: 'base-3',
        deploymentId: 'base-3-deployment',
        providerId: 'openai',
        modelId: 'base-3-model',
        displayName: 'base-3 display',
        supportsWebSearch: false,
      },
      {
        slot: 'consolidator',
        deploymentId: 'consolidator-deployment',
        providerId: 'openrouter',
        modelId: 'consolidator-model',
        displayName: 'consolidator display',
        supportsWebSearch: true,
      },
    ]);
    expect(JSON.stringify(detail)).not.toMatch(
      /contextLimit|maxOutput|modalities|credential|apiKey|SECRET/
    );
  });
});
