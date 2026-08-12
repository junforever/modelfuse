import type { LlmProvider } from '../../types/llm.js';
import type { ResponseSlot } from '../../types/conversations.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { MiniMaxProvider } from './providers/MiniMaxProvider.js';
import { OpenAiProvider } from './providers/OpenAiProvider.js';
import { QwenProvider } from './providers/QwenProvider.js';

const environment = {
  openAiApiKey: required('OPENAI_API_KEY'),
  openAiModel: required('OPENAI_MODEL'),
  openAiBaseUrl: optional('OPENAI_BASE_URL'),
  googleApiKey: required('GOOGLE_API_KEY'),
  googleModel: required('GOOGLE_MODEL'),
  googleBaseUrl: optional('GOOGLE_BASE_URL'),
  minimaxApiKey: required('MINIMAX_API_KEY'),
  minimaxModel: required('MINIMAX_MODEL'),
  minimaxBaseUrl: optional('MINIMAX_BASE_URL'),
  qwenApiKey: required('QWEN_API_KEY'),
  qwenModel: required('QWEN_MODEL'),
  qwenBaseUrl: optional('QWEN_BASE_URL'),
  timeoutMs: requiredPositiveInteger('LLM_PROVIDER_TIMEOUT_MS'),
  openAiContextLimit: requiredPositiveInteger('OPENAI_CONTEXT_LIMIT_TOKENS'),
  googleContextLimit: requiredPositiveInteger('GOOGLE_CONTEXT_LIMIT_TOKENS'),
  minimaxContextLimit: requiredPositiveInteger('MINIMAX_CONTEXT_LIMIT_TOKENS'),
  qwenContextLimit: requiredPositiveInteger('QWEN_CONTEXT_LIMIT_TOKENS'),
};

export const providerRegistry: Record<ResponseSlot, LlmProvider> = {
  openai: new OpenAiProvider({
    apiKey: environment.openAiApiKey,
    model: environment.openAiModel,
    endpoint:
      environment.openAiBaseUrl ||
      'https://api.openai.com/v1/chat/completions',
    timeoutMs: environment.timeoutMs,
    contextLimitTokens: environment.openAiContextLimit,
  }),
  google: new GoogleProvider({
    apiKey: environment.googleApiKey,
    model: environment.googleModel,
    endpoint:
      environment.googleBaseUrl ||
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(environment.googleModel)}:generateContent`,
    timeoutMs: environment.timeoutMs,
    contextLimitTokens: environment.googleContextLimit,
  }),
  minimax: new MiniMaxProvider({
    apiKey: environment.minimaxApiKey,
    model: environment.minimaxModel,
    endpoint:
      environment.minimaxBaseUrl ||
      'https://api.minimax.chat/v1/text/chatcompletion_v2',
    timeoutMs: environment.timeoutMs,
    contextLimitTokens: environment.minimaxContextLimit,
  }),
  qwen: new QwenProvider({
    apiKey: environment.qwenApiKey,
    model: environment.qwenModel,
    endpoint:
      environment.qwenBaseUrl ||
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    timeoutMs: environment.timeoutMs,
    contextLimitTokens: environment.qwenContextLimit,
  }),
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Invalid environment configuration: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requiredPositiveInteger(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid environment configuration: ${name}`);
  }
  return value;
}
