import { z } from 'zod';

const optionalPositiveInteger = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().optional()
);
const frontendEnvSchema = z
  .object({
    VITE_API_BASE_URL: z.string().trim().pipe(z.url()),
    VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD: optionalPositiveInteger,
  })
  .transform(({ VITE_API_BASE_URL, VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD }) => ({
    apiBaseUrl: VITE_API_BASE_URL,
    historyCollapseCharThreshold: VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD,
  }));

export type FrontendEnvironment = z.output<typeof frontendEnvSchema>;

export function parseFrontendEnv(raw: Record<string, unknown>): FrontendEnvironment {
  return frontendEnvSchema.parse(raw);
}
