export const RESPONSE_SLOTS = ['openai', 'google', 'minimax', 'qwen'] as const;

export type ResponseSlot = (typeof RESPONSE_SLOTS)[number];
export type BaseResponseSlot = Exclude<ResponseSlot, 'qwen'>;
export type ResponseRole = 'base' | 'consolidator';
export type ResponseStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TurnStatus = 'pending' | 'running' | 'partial' | 'completed' | 'failed';
export type IsoDateTime = string;

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

export interface ModelResponseError {
  readonly code: string;
  readonly message: string;
}

export interface ContextWindowMetadata {
  readonly truncated: boolean;
  readonly firstIncludedOrdinal: number;
  readonly lastIncludedOrdinal: number;
  readonly protectionApplied: string;
}

export interface ModelResponseMetadata {
  readonly durationMs?: number;
  readonly contextWindow?: ContextWindowMetadata;
}

export interface ModelResponse<Slot extends ResponseSlot = ResponseSlot> {
  readonly slot: Slot;
  readonly role: Slot extends 'qwen' ? 'consolidator' : 'base';
  readonly provider: string;
  readonly model: string;
  readonly status: ResponseStatus;
  readonly content: string | null;
  readonly error: ModelResponseError | null;
  readonly recoverable: boolean;
  readonly continuedWithout: boolean;
  readonly isStale: boolean;
  readonly attemptNo: number;
  readonly metadata: ModelResponseMetadata | null;
  readonly startedAt: IsoDateTime | null;
  readonly completedAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type TurnResponses = readonly [
  ModelResponse<'openai'>,
  ModelResponse<'google'>,
  ModelResponse<'minimax'>,
  ModelResponse<'qwen'>,
];

export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly hasWorkInProgress: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type ConversationDetail = ConversationSummary;

export interface Turn {
  readonly id: string;
  readonly clientRequestId: string;
  readonly ordinal: number;
  readonly prompt: string;
  readonly status: TurnStatus;
  readonly responses: TurnResponses;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CreateTurnRequest {
  readonly clientRequestId: string;
  readonly prompt: string;
}

export type CreateConversationRequest = CreateTurnRequest;

export interface RenameConversationRequest {
  readonly title: string;
}

export interface ConversationTurnResponse {
  readonly conversation: ConversationSummary;
  readonly turn: Turn;
}

export interface ConversationPage {
  readonly items: readonly ConversationSummary[];
  readonly nextCursor: string | null;
}

export interface TurnPage {
  readonly items: readonly Turn[];
  readonly olderCursor: string | null;
  readonly hasOlder: boolean;
}

export interface TurnSnapshotResponse {
  readonly conversation: Pick<ConversationSummary, 'id' | 'hasWorkInProgress'>;
  readonly turn: Turn;
}
