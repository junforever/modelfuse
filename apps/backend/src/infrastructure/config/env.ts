import { z } from 'zod';

const requiredSetting = z.string().trim().min(1);
const positiveInteger = z.coerce.number().int().positive().safe();

const envSchema = z.object({
  OPENAI_API_KEY: requiredSetting,
  OPENAI_MODEL: requiredSetting,
  GOOGLE_API_KEY: requiredSetting,
  GOOGLE_MODEL: requiredSetting,
  MINIMAX_API_KEY: requiredSetting,
  MINIMAX_MODEL: requiredSetting,
  QWEN_API_KEY: requiredSetting,
  QWEN_MODEL: requiredSetting,
  LLM_PROVIDER_TIMEOUT_MS: positiveInteger,
  CONVERSATION_CONTEXT_MAX_TURNS: positiveInteger,
  LLM_CONTEXT_THRESHOLD_RATIO: z.coerce
    .number()
    .finite()
    .gt(0)
    .lte(1)
    .default(0.8),
  OPENAI_CONTEXT_LIMIT_TOKENS: positiveInteger,
  GOOGLE_CONTEXT_LIMIT_TOKENS: positiveInteger,
  MINIMAX_CONTEXT_LIMIT_TOKENS: positiveInteger,
  QWEN_CONTEXT_LIMIT_TOKENS: positiveInteger,
  CONVERSATION_SIDEBAR_PAGE_SIZE: positiveInteger,
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): Environment {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const variables = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];

    throw new Error(`Invalid environment configuration: ${variables.join(', ')}`);
  }

  return result.data;
}
