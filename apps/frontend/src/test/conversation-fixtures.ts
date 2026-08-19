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

export function modelResponse<Slot extends ResponseSlot>(
  slot: Slot,
  overrides: Partial<ModelResponse<Slot>> = {}
): ModelResponse<Slot> {
  return {
    slot,
    role: slot === 'qwen' ? 'consolidator' : 'base',
    provider: slot,
    model: `${slot}-model`,
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
      modelResponse('openai'),
      modelResponse('google'),
      modelResponse('minimax'),
      modelResponse('qwen'),
    ],
    createdAt: eventTime,
    updatedAt: eventTime,
    ...overrides,
  };
}

export function turnSnapshotFixture(
  overrides: Partial<TurnEventSnapshot> = {}
): TurnEventSnapshot {
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
