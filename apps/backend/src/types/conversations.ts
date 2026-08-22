export type { ApiError, ApiErrorCode } from './apiError.js';

export const RESPONSE_SLOTS = ['base-1', 'base-2', 'base-3', 'consolidator'] as const;

export type ResponseSlot = (typeof RESPONSE_SLOTS)[number];
export type BaseResponseSlot = Exclude<ResponseSlot, 'consolidator'>;
export type ResponseRole = 'base' | 'consolidator';
export type ResponseStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TurnStatus = 'pending' | 'running' | 'partial' | 'completed' | 'failed';
export type IsoDateTime = string;
export type ProviderId = 'openai' | 'google' | 'minimax' | 'qwen' | 'openrouter';
export type Modality = 'text' | 'image' | 'video' | 'audio' | 'pdf';
export type CredentialEnvironmentVariable =
  'OPENAI_API_KEY' | 'GOOGLE_API_KEY' | 'MINIMAX_API_KEY' | 'QWEN_API_KEY' | 'OPENROUTER_API_KEY';

export interface DeploymentDefinition {
  readonly deploymentId: string;
  readonly displayName: string;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly contextLimitTokens: number;
  readonly maxOutputTokens: number;
  readonly inputModalities: readonly [Modality, ...Modality[]];
  readonly outputModalities: readonly [Modality, ...Modality[]];
  readonly credentialEnv: CredentialEnvironmentVariable;
}

export type DeploymentCatalogItem = Omit<DeploymentDefinition, 'credentialEnv'>;
export type DeploymentAssignment = Readonly<Record<ResponseSlot, string>>;

export type ConversationDeploymentSnapshot<Slot extends ResponseSlot = ResponseSlot> =
  DeploymentCatalogItem & { readonly slot: Slot };

export interface ConversationDeploymentSummary<Slot extends ResponseSlot = ResponseSlot> {
  readonly slot: Slot;
  readonly deploymentId: string;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly displayName: string;
}

export type ConversationDeploymentSnapshotTuple = readonly [
  ConversationDeploymentSnapshot<'base-1'>,
  ConversationDeploymentSnapshot<'base-2'>,
  ConversationDeploymentSnapshot<'base-3'>,
  ConversationDeploymentSnapshot<'consolidator'>,
];

export type DeploymentSummaryTuple = readonly [
  ConversationDeploymentSummary<'base-1'>,
  ConversationDeploymentSummary<'base-2'>,
  ConversationDeploymentSummary<'base-3'>,
  ConversationDeploymentSummary<'consolidator'>,
];

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
  role: Slot extends 'consolidator' ? 'consolidator' : 'base';
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
  ModelResponse<'base-1'>,
  ModelResponse<'base-2'>,
  ModelResponse<'base-3'>,
  ModelResponse<'consolidator'>,
];

export interface ConversationSummary {
  id: string;
  title: string;
  hasWorkInProgress: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ConversationDetail extends ConversationSummary {
  deployments: DeploymentSummaryTuple;
}

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

export interface CreateConversationRequest extends CreateTurnRequest {
  deploymentIds?: DeploymentAssignment;
}

export interface RenameConversationRequest {
  title: string;
}

export interface ConversationTurnResponse {
  conversation: ConversationDetail;
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
