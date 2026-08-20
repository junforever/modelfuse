import type {
  DeploymentSummaryTuple,
  IsoDateTime,
  ModelResponse,
  ResponseSlot,
  Turn,
} from './conversation';

export type EventSequence = number;

export interface SlotUpdateData<Slot extends ResponseSlot = ResponseSlot> {
  readonly conversationId: string;
  readonly turnId: string;
  readonly eventSequence: EventSequence;
  readonly response: ModelResponse<Slot>;
  readonly runtimeStage?: string;
}

export interface TurnUpdateData {
  readonly conversationId: string;
  readonly turnId: string;
  readonly eventSequence: EventSequence;
  readonly turn: Pick<Turn, 'id' | 'status' | 'updatedAt'>;
}

export interface BusyUpdateData {
  readonly conversationId: string;
  readonly turnId: string;
  readonly eventSequence: EventSequence;
  readonly hasWorkInProgress: boolean;
  readonly updatedAt: IsoDateTime;
}

export type TurnEvent =
  | { readonly event: 'slot_update'; readonly data: SlotUpdateData }
  | { readonly event: 'turn_update'; readonly data: TurnUpdateData }
  | { readonly event: 'busy_update'; readonly data: BusyUpdateData };

export interface TurnEventSnapshot {
  readonly conversationId: string;
  readonly turnId: string;
  readonly deployments: DeploymentSummaryTuple;
  readonly turn: Turn;
  readonly hasWorkInProgress: boolean;
  readonly updatedAt: IsoDateTime;
  readonly lastEventSequence: EventSequence;
}
