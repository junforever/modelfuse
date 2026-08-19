export type { ApiError, ApiErrorCode } from './apiError.js';

export const RESPONSE_SLOTS = ['openai', 'google', 'minimax', 'qwen'] as const;

export type ResponseSlot = (typeof RESPONSE_SLOTS)[number];
export type BaseResponseSlot = Exclude<ResponseSlot, 'qwen'>;
export type ResponseRole = 'base' | 'consolidator';
export type ResponseStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TurnStatus = 'pending' | 'running' | 'partial' | 'completed' | 'failed';
export type IsoDateTime = string;

export interface ModelResponseError {
  code: string;
  message: string;
}

export interface ContextWindowMetadata {
  truncated: boolean;
  firstIncludedOrdinal: number;
  lastIncludedOrdinal: number;
  protectionApplied: string;
}

export interface ModelResponseMetadata {
  durationMs?: number;
  contextWindow?: ContextWindowMetadata;
}

export interface ModelResponse<Slot extends ResponseSlot = ResponseSlot> {
  slot: Slot;
  role: Slot extends 'qwen' ? 'consolidator' : 'base';
  provider: string;
  model: string;
  status: ResponseStatus;
  content: string | null;
  error: ModelResponseError | null;
  recoverable: boolean;
  continuedWithout: boolean;
  isStale: boolean;
  attemptNo: number;
  metadata: ModelResponseMetadata | null;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** REST array in the stable, canonical tab order. */
export type TurnResponses = [
  ModelResponse<'openai'>,
  ModelResponse<'google'>,
  ModelResponse<'minimax'>,
  ModelResponse<'qwen'>,
];

export interface ConversationSummary {
  id: string;
  title: string;
  hasWorkInProgress: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ConversationDetail = ConversationSummary;

export interface Turn {
  id: string;
  clientRequestId: string;
  ordinal: number;
  prompt: string;
  status: TurnStatus;
  responses: TurnResponses;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateTurnRequest {
  clientRequestId: string;
  prompt: string;
}

export type CreateConversationRequest = CreateTurnRequest;

export interface RenameConversationRequest {
  title: string;
}

export interface ConversationTurnResponse {
  conversation: ConversationSummary;
  turn: Turn;
}

export interface ConversationPage {
  items: ConversationSummary[];
  nextCursor: string | null;
}

export interface TurnPage {
  items: Turn[];
  olderCursor: string | null;
  hasOlder: boolean;
}

export interface TurnSnapshotResponse {
  conversation: Pick<ConversationSummary, 'id' | 'hasWorkInProgress'>;
  turn: Turn;
}
