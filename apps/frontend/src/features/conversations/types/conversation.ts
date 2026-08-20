export const RESPONSE_SLOTS = ['base-1', 'base-2', 'base-3', 'consolidator'] as const;
export const PROVIDER_IDS = ['openai', 'google', 'minimax', 'qwen', 'openrouter'] as const;
export const MODALITIES = ['text', 'image', 'video', 'audio', 'pdf'] as const;

export type ResponseSlot = (typeof RESPONSE_SLOTS)[number];
export const RESPONSE_SLOT_LABELS: Readonly<Record<ResponseSlot, string>> = {
  'base-1': 'Base 1',
  'base-2': 'Base 2',
  'base-3': 'Base 3',
  consolidator: 'Consolidador',
};
export type BaseResponseSlot = Exclude<ResponseSlot, 'consolidator'>;
export type ResponseRole<Slot extends ResponseSlot = ResponseSlot> =
  Slot extends 'consolidator' ? 'consolidator' : 'base';
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type Modality = (typeof MODALITIES)[number];
export type ResponseStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TurnStatus = 'pending' | 'running' | 'partial' | 'completed' | 'failed';
export type IsoDateTime = string;

export interface DeploymentCatalogItem {
  readonly deploymentId: string;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly displayName: string;
  readonly contextLimitTokens: number;
  readonly maxOutputTokens: number;
  readonly inputModalities: readonly [Modality, ...Modality[]];
  readonly outputModalities: readonly [Modality, ...Modality[]];
}

export interface ModelCatalogResponse {
  readonly items: readonly DeploymentCatalogItem[];
}

export interface DeploymentIds {
  readonly 'base-1': string;
  readonly 'base-2': string;
  readonly 'base-3': string;
  readonly consolidator: string;
}

export interface ConversationDeploymentSummary<Slot extends ResponseSlot = ResponseSlot> {
  readonly slot: Slot;
  readonly deploymentId: string;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly displayName: string;
}

export type DeploymentSummaryTuple = readonly [
  ConversationDeploymentSummary<'base-1'>,
  ConversationDeploymentSummary<'base-2'>,
  ConversationDeploymentSummary<'base-3'>,
  ConversationDeploymentSummary<'consolidator'>,
];

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
  readonly role: ResponseRole<Slot>;
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
  ModelResponse<'base-1'>,
  ModelResponse<'base-2'>,
  ModelResponse<'base-3'>,
  ModelResponse<'consolidator'>,
];

export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly hasWorkInProgress: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ConversationDetail extends ConversationSummary {
  readonly deployments: DeploymentSummaryTuple;
}

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

export interface CreateConversationRequest extends CreateTurnRequest {
  readonly deploymentIds?: DeploymentIds;
}

export interface RenameConversationRequest {
  readonly title: string;
}

export interface ConversationTurnResponse {
  readonly conversation: ConversationDetail;
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
