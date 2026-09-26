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
      deployments: [
        {
          slot: 'base-1',
          deploymentId: 'openai-test-deployment',
          providerId: 'openai',
          modelId: 'openai-test-model',
          displayName: 'OpenAI test deployment',
          supportsWebSearch: false,
        },
        {
          slot: 'base-2',
          deploymentId: 'google-test-deployment',
          providerId: 'google',
          modelId: 'google-test-model',
          displayName: 'Google test deployment',
          supportsWebSearch: false,
        },
        {
          slot: 'base-3',
          deploymentId: 'minimax-test-deployment',
          providerId: 'minimax',
          modelId: 'minimax-test-model',
          displayName: 'MiniMax test deployment',
          supportsWebSearch: false,
        },
        {
          slot: 'consolidator',
          deploymentId: 'qwen-test-deployment',
          providerId: 'qwen',
          modelId: 'qwen-test-model',
          displayName: 'Qwen test deployment',
          supportsWebSearch: false,
        },
      ],
    },
    turn: {
      id: '00000000-0000-4000-8000-000000000002',
      clientRequestId: '00000000-0000-4000-8000-000000000003',
      ordinal: 1,
      prompt: 'Compare this deterministic prompt.',
      webSearchEnabled: false,
      status: 'completed',
      responses,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
  };
}
