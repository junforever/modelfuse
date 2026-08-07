import { parseEnv } from '../config/env.js';
import type { LlmProvider } from '../../types/llm.js';
import type { ResponseSlot } from '../../types/conversations.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { MiniMaxProvider } from './providers/MiniMaxProvider.js';
import { OpenAiProvider } from './providers/OpenAiProvider.js';
import { QwenProvider } from './providers/QwenProvider.js';

const env = parseEnv(process.env);

export const providerRegistry: Record<ResponseSlot, LlmProvider> = {
  openai: new OpenAiProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    endpoint:
      process.env.OPENAI_BASE_URL?.trim() ||
      'https://api.openai.com/v1/chat/completions',
    timeoutMs: env.LLM_PROVIDER_TIMEOUT_MS,
    contextLimitTokens: env.OPENAI_CONTEXT_LIMIT_TOKENS,
  }),
  google: new GoogleProvider({
    apiKey: env.GOOGLE_API_KEY,
    model: env.GOOGLE_MODEL,
    endpoint:
      process.env.GOOGLE_BASE_URL?.trim() ||
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GOOGLE_MODEL)}:generateContent`,
    timeoutMs: env.LLM_PROVIDER_TIMEOUT_MS,
    contextLimitTokens: env.GOOGLE_CONTEXT_LIMIT_TOKENS,
  }),
  minimax: new MiniMaxProvider({
    apiKey: env.MINIMAX_API_KEY,
    model: env.MINIMAX_MODEL,
    endpoint:
      process.env.MINIMAX_BASE_URL?.trim() ||
      'https://api.minimax.chat/v1/text/chatcompletion_v2',
    timeoutMs: env.LLM_PROVIDER_TIMEOUT_MS,
    contextLimitTokens: env.MINIMAX_CONTEXT_LIMIT_TOKENS,
  }),
  qwen: new QwenProvider({
    apiKey: env.QWEN_API_KEY,
    model: env.QWEN_MODEL,
    endpoint:
      process.env.QWEN_BASE_URL?.trim() ||
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    timeoutMs: env.LLM_PROVIDER_TIMEOUT_MS,
    contextLimitTokens: env.QWEN_CONTEXT_LIMIT_TOKENS,
  }),
};
