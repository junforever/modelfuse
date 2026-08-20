import type { Environment } from '../config/env.js';
import type { ProviderRegistry } from '../../types/llm.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { MiniMaxProvider } from './providers/MiniMaxProvider.js';
import { OpenAiProvider } from './providers/OpenAiProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { QwenProvider } from './providers/QwenProvider.js';

type ProviderEnvironment = Pick<
  Environment,
  | 'OPENAI_API_KEY'
  | 'OPENAI_BASE_URL'
  | 'GOOGLE_API_KEY'
  | 'GOOGLE_BASE_URL'
  | 'MINIMAX_API_KEY'
  | 'MINIMAX_BASE_URL'
  | 'QWEN_API_KEY'
  | 'QWEN_BASE_URL'
  | 'OPENROUTER_API_KEY'
  | 'LLM_PROVIDER_TIMEOUT_MS'
>;

export function createProviderRegistry(environment: ProviderEnvironment): ProviderRegistry {
  const timeoutMs = environment.LLM_PROVIDER_TIMEOUT_MS;
  return {
    ...(environment.OPENAI_API_KEY
      ? {
          openai: new OpenAiProvider({
            apiKey: environment.OPENAI_API_KEY,
            endpoint: environment.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/chat/completions',
            timeoutMs,
          }),
        }
      : {}),
    ...(environment.GOOGLE_API_KEY
      ? {
          google: new GoogleProvider({
            apiKey: environment.GOOGLE_API_KEY,
            endpoint: environment.GOOGLE_BASE_URL ?? 'https://generativelanguage.googleapis.com',
            timeoutMs,
          }),
        }
      : {}),
    ...(environment.MINIMAX_API_KEY
      ? {
          minimax: new MiniMaxProvider({
            apiKey: environment.MINIMAX_API_KEY,
            endpoint:
              environment.MINIMAX_BASE_URL ?? 'https://api.minimax.chat/v1/text/chatcompletion_v2',
            timeoutMs,
          }),
        }
      : {}),
    ...(environment.QWEN_API_KEY
      ? {
          qwen: new QwenProvider({
            apiKey: environment.QWEN_API_KEY,
            endpoint:
              environment.QWEN_BASE_URL ??
              'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
            timeoutMs,
          }),
        }
      : {}),
    ...(environment.OPENROUTER_API_KEY
      ? {
          openrouter: new OpenRouterProvider({ apiKey: environment.OPENROUTER_API_KEY, timeoutMs }),
        }
      : {}),
  };
}
