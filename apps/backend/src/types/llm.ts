import type { ResponseSlot } from './conversations.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  operationId: string;
  slot: ResponseSlot;
  messages: LlmMessage[];
  signal: AbortSignal;
}

export interface LlmMetrics {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  currency?: string;
}

export interface LlmResult {
  content: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string;
  metrics?: LlmMetrics;
  metadata?: Record<string, string | number | boolean | null>;
}

export type InputTokenMeasurement =
  | { kind: 'exact'; tokens: number }
  | { kind: 'upper_bound'; tokens: number; basis: string };

export interface LlmContextCapabilities {
  limitTokens: number;
  measureInputTokens(messages: LlmMessage[]): InputTokenMeasurement;
}

export interface LlmProvider {
  readonly slot: ResponseSlot;
  readonly provider: string;
  readonly model: string;
  readonly context: LlmContextCapabilities;
  generate(request: LlmRequest): Promise<LlmResult>;
}

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
  apiKey: string;
  model: string;
  endpoint: string;
  timeoutMs: number;
  contextLimitTokens: number;
}
