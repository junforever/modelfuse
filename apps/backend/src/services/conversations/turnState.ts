import {
  RESPONSE_SLOTS,
  type ResponseSlot,
  type ResponseStatus,
  type TurnStatus,
} from '../../types/conversations.js';

export interface TurnSlotState {
  slot: ResponseSlot;
  status: ResponseStatus;
  isStale?: boolean;
}

export interface CalculatedTurnState {
  status: Extract<TurnStatus, 'running' | 'partial' | 'completed' | 'failed'>;
  hasWorkInProgress: boolean;
}

function requireCanonicalSlots(slots: readonly TurnSlotState[]): readonly TurnSlotState[] {
  if (slots.length !== RESPONSE_SLOTS.length) {
    throw new Error(`Expected exactly ${RESPONSE_SLOTS.length} response slots`);
  }

  const bySlot = new Map(slots.map((slot) => [slot.slot, slot]));
  if (bySlot.size !== RESPONSE_SLOTS.length) {
    throw new Error('Response slots must be unique');
  }

  return RESPONSE_SLOTS.map((slot) => {
    const state = bySlot.get(slot);
    if (state === undefined) {
      throw new Error(`Missing response slot: ${slot}`);
    }
    return state;
  });
}

export function calculateTurnState(slots: readonly TurnSlotState[]): CalculatedTurnState {
  const canonicalSlots = requireCanonicalSlots(slots);
  const hasWorkInProgress = canonicalSlots.some(
    ({ status }) => status === 'pending' || status === 'running',
  );

  if (hasWorkInProgress) {
    return { status: 'running', hasWorkInProgress: true };
  }

  const usefulResponses = canonicalSlots.filter(
    ({ status, isStale }) => status === 'completed' && isStale !== true,
  ).length;

  if (usefulResponses === RESPONSE_SLOTS.length) {
    return { status: 'completed', hasWorkInProgress: false };
  }

  return {
    status: usefulResponses > 0 ? 'partial' : 'failed',
    hasWorkInProgress: false,
  };
}
