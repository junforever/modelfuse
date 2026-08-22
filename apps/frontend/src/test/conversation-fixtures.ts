import type {
  ModelResponse,
  ResponseSlot,
  Turn,
} from '../features/conversations/types/conversation';
import type { TurnEventSnapshot } from '../features/conversations/types/sse';

export const conversationId = '123e4567-e89b-42d3-a456-426614174000';
export const turnId = '223e4567-e89b-42d3-a456-426614174000';
export const clientRequestId = '323e4567-e89b-42d3-a456-426614174000';
export const eventTime = '2026-07-26T20:00:01.000Z';

const IDENTITIES: Record<ResponseSlot, { provider: string; model: string }> = {
  'base-1': { provider: 'openai', model: 'openai-model' },
  'base-2': { provider: 'google', model: 'google-model' },
  'base-3': { provider: 'minimax', model: 'minimax-model' },
  consolidator: { provider: 'qwen', model: 'qwen-model' },
};

export function modelResponse<Slot extends ResponseSlot>(
  slot: Slot,
  overrides: Partial<ModelResponse<Slot>> = {}
): ModelResponse<Slot> {
  const identity = IDENTITIES[slot];

  return {
    slot,
    role: slot === 'consolidator' ? 'consolidator' : 'base',
    provider: identity.provider,
    model: identity.model,
    status: 'running',
    content: null,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: eventTime,
    completedAt: null,
    createdAt: eventTime,
    updatedAt: eventTime,
    ...overrides,
  } as ModelResponse<Slot>;
}

export function turnFixture(overrides: Partial<Turn> = {}): Turn {
  return {
    id: turnId,
    clientRequestId,
    ordinal: 1,
    prompt: 'Compara estas respuestas',
    status: 'running',
    responses: [
      modelResponse('base-1'),
      modelResponse('base-2'),
      modelResponse('base-3'),
      modelResponse('consolidator'),
    ],
    createdAt: eventTime,
    updatedAt: eventTime,
    ...overrides,
  };
}

export function turnSnapshotFixture(overrides: Partial<TurnEventSnapshot> = {}): TurnEventSnapshot {
  return {
    conversationId,
    turnId,
    turn: turnFixture(),
    hasWorkInProgress: true,
    updatedAt: eventTime,
    lastEventSequence: 10,
    ...overrides,
  };
}
