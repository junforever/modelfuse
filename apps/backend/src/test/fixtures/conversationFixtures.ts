import type {
  ConversationTurnResponse,
  ModelResponse,
  ResponseSlot,
  TurnResponses,
} from '../../types/conversations.js';

const FIXED_AT = '2026-01-02T03:04:05.000Z';

const IDENTITIES: Record<ResponseSlot, { provider: string; model: string }> = {
  'base-1': { provider: 'openai-fake', model: 'openai-test-model' },
  'base-2': { provider: 'google-fake', model: 'google-test-model' },
  'base-3': { provider: 'minimax-fake', model: 'minimax-test-model' },
  consolidator: { provider: 'qwen-fake', model: 'qwen-test-model' },
};

function completedResponse<Slot extends ResponseSlot>(slot: Slot): ModelResponse<Slot> {
  const identity = IDENTITIES[slot];

  return {
    slot,
    role: (slot === 'consolidator' ? 'consolidator' : 'base') as ModelResponse<Slot>['role'],
    provider: identity.provider,
    model: identity.model,
    status: 'completed',
    content: `Deterministic ${slot} response`,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: FIXED_AT,
    completedAt: FIXED_AT,
    createdAt: FIXED_AT,
    updatedAt: FIXED_AT,
  };
}

export function createConversationFixture(): ConversationTurnResponse {
  const responses: TurnResponses = [
    completedResponse('base-1'),
    completedResponse('base-2'),
    completedResponse('base-3'),
    completedResponse('consolidator'),
  ];

  return {
    conversation: {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Deterministic conversation',
      hasWorkInProgress: false,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
    turn: {
      id: '00000000-0000-4000-8000-000000000002',
      clientRequestId: '00000000-0000-4000-8000-000000000003',
      ordinal: 1,
      prompt: 'Compare this deterministic prompt.',
      status: 'completed',
      responses,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
  };
}
