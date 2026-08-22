import type { IsoDateTime, ModelResponse, ResponseSlot, Turn } from './conversations.js';

/** Non-negative integer assigned monotonically within one turn by the in-process publisher. */
export type EventSequence = number;

export interface SlotUpdateData<Slot extends ResponseSlot = ResponseSlot> {
  conversationId: string;
  turnId: string;
  eventSequence: EventSequence;
  response: ModelResponse<Slot>;
  runtimeStage?: string;
}

export type SlotUpdateEvent<Slot extends ResponseSlot = ResponseSlot> = {
  event: 'slot_update';
  data: SlotUpdateData<Slot>;
};

export interface TurnUpdateData {
  conversationId: string;
  turnId: string;
  eventSequence: EventSequence;
  turn: Pick<Turn, 'id' | 'status' | 'updatedAt'>;
}

export interface BusyUpdateData {
  conversationId: string;
  turnId: string;
  eventSequence: EventSequence;
  hasWorkInProgress: boolean;
  updatedAt: IsoDateTime;
}

export type TurnEvent =
  | SlotUpdateEvent
  | { event: 'turn_update'; data: TurnUpdateData }
  | { event: 'busy_update'; data: BusyUpdateData };

/** Persisted state read while opening a stream, before buffered events are drained. */
export interface TurnEventSnapshot {
  conversationId: string;
  turnId: string;
  turn: Turn;
  hasWorkInProgress: boolean;
  updatedAt: IsoDateTime;
  lastEventSequence: EventSequence;
}
