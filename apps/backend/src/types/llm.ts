import type { ConversationDeploymentSnapshot, ProviderId, ResponseSlot } from './conversations.js';

export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LlmRequest {
  readonly slot: ResponseSlot;
  readonly deployment: ConversationDeploymentSnapshot;
  readonly messages: readonly LlmMessage[];
  readonly signal?: AbortSignal;
}

export interface LlmMetrics {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface LlmResult {
  readonly content: string;
  readonly provider: string;
  readonly model: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly metrics?: LlmMetrics;
}

export interface LlmProvider {
  readonly providerId: ProviderId;
  measureInputTokens(
    deployment: ConversationDeploymentSnapshot,
    messages: readonly LlmMessage[]
  ): Promise<number>;
  generate(request: LlmRequest): Promise<LlmResult>;
}

export type ProviderRegistry = Readonly<Partial<Record<ProviderId, LlmProvider>>>;

export type LlmErrorCode =
  | 'authentication'
  | 'rate_limited'
  | 'timeout'
  | 'connectivity'
  | 'content_blocked'
  | 'invalid_prompt_size'
  | 'invalid_response'
  | 'provider_transient_error'
  | 'provider_error';

export interface LlmProviderError {
  code: LlmErrorCode;
  safeMessage: string;
  provider: string;
  model: string;
  recoverable: boolean;
}

export interface LlmProviderConfig {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly timeoutMs: number;
}
