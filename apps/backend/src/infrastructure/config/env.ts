import { z } from 'zod';

const requiredSetting = z.string().trim().min(1);
const optionalSetting = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  requiredSetting.optional()
);
const positiveInteger = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().safe());
const nonNegativeInteger = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine(value => {
    try {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.origin === value.replace(/\/$/, '')
      );
    } catch {
      return false;
    }
  });
const optionalHttpUrl = z.preprocess(
  value => (value === '' ? undefined : value),
  httpUrl.optional()
);
const requestBodySize = z
  .string()
  .trim()
  .regex(/^[1-9]\d*(?:b|kb|mb|gb)$/i)
  .refine(value => toBytes(value) <= 100 * 1024 * 1024);
const requestTimeout = z
  .string()
  .trim()
  .regex(/^[1-9]\d*(?:ms|s|m|h|d)$/i)
  .refine(value => toMilliseconds(value) <= 60 * 60 * 1_000);
const strictBoolean = z.enum(['true', 'false']).transform(value => value === 'true');

const envSchema = z
  .object({
    PORT: nonNegativeInteger.pipe(z.number().max(65_535)),
    NODE_ENV: z.enum(['development', 'test', 'production']),
    FRONTEND_URL_LOCALHOST: optionalHttpUrl,
    FRONTEND_URL: optionalHttpUrl,
    REQUEST_MAX_BODY_SIZE: requestBodySize,
    REQUEST_TIMEOUT: requestTimeout,
    POSTGRES_USER: requiredSetting,
    POSTGRES_PASSWORD: requiredSetting,
    POSTGRES_DB: requiredSetting,
    POSTGRES_MAX_CONNECTIONS: positiveInteger.pipe(z.number().max(100)),
    POSTGRES_IDLE_TIMEOUT: nonNegativeInteger.pipe(z.number().max(2_147_483_647)),
    POSTGRES_CONNECTION_TIMEOUT: nonNegativeInteger.pipe(z.number().max(2_147_483_647)),
    POSTGRES_KEEP_ALIVE: strictBoolean,
    OPENAI_API_KEY: optionalSetting,
    OPENAI_BASE_URL: optionalHttpUrl,
    GOOGLE_API_KEY: optionalSetting,
    GOOGLE_BASE_URL: optionalHttpUrl,
    MINIMAX_API_KEY: optionalSetting,
    MINIMAX_BASE_URL: optionalHttpUrl,
    QWEN_API_KEY: optionalSetting,
    QWEN_BASE_URL: optionalHttpUrl,
    MOONSHOT_API_KEY: optionalSetting,
    OPENROUTER_API_KEY: optionalSetting,
    LLM_PROVIDER_TIMEOUT_MS: positiveInteger,
    CONVERSATION_CONTEXT_MAX_TURNS: positiveInteger,
    LLM_CONTEXT_THRESHOLD_RATIO: z.coerce.number().finite().gt(0).lte(1).default(0.8),
    CONVERSATION_SIDEBAR_PAGE_SIZE: positiveInteger,
  })
  .superRefine((environment, context) => {
    const originName =
      environment.NODE_ENV === 'production' ? 'FRONTEND_URL' : 'FRONTEND_URL_LOCALHOST';
    if (!environment[originName]) {
      context.addIssue({
        code: 'custom',
        path: [originName],
        message: `${originName} is required`,
      });
    }
  });

export type Environment = z.infer<typeof envSchema>;
export type AppEnvironment = Pick<
  Environment,
  | 'NODE_ENV'
  | 'FRONTEND_URL_LOCALHOST'
  | 'FRONTEND_URL'
  | 'REQUEST_MAX_BODY_SIZE'
  | 'REQUEST_TIMEOUT'
>;

const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL_LOCALHOST: optionalHttpUrl,
  FRONTEND_URL: optionalHttpUrl,
  REQUEST_MAX_BODY_SIZE: requestBodySize.default('1mb'),
  REQUEST_TIMEOUT: requestTimeout.default('15s'),
});

export function parseEnv(input: NodeJS.ProcessEnv): Environment {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const variables = [...new Set(result.error.issues.map(issue => String(issue.path[0])))];

    throw new Error(`Invalid environment configuration: ${variables.join(', ')}`);
  }

  return result.data;
}

export function parseAppEnv(input: NodeJS.ProcessEnv): AppEnvironment {
  const result = appEnvSchema.safeParse(input);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map(issue => String(issue.path[0])))];
    throw new Error(`Invalid environment configuration: ${variables.join(', ')}`);
  }
  return result.data;
}

function toBytes(value: string): number {
  const amount = Number.parseInt(value, 10);
  const unit = value.slice(String(amount).length).toLowerCase();
  return amount * ({ b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[unit] ?? Infinity);
}

function toMilliseconds(value: string): number {
  const amount = Number.parseInt(value, 10);
  const unit = value.slice(String(amount).length).toLowerCase();
  return amount * ({ ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? Infinity);
}
