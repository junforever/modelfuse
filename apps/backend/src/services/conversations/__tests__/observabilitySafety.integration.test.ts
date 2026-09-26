import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderRegistry } from '../../../infrastructure/llm/providerRegistry.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversationRequests,
  dropIntegrationSchema,
} from '../../../test/integration/testDatabase.js';
import type {
  DeploymentAssignment,
  DeploymentDefinition,
  ResponseSlot,
} from '../../../types/conversations.js';

const axiosMock = vi.hoisted(() => ({ request: vi.fn() }));
const logSink = vi.hoisted(() => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const bind = (bindings: Record<string, unknown> = {}) => {
    const emit = (sink: typeof info, args: unknown[]): void => {
      const [first, ...rest] = args;
      sink(
        typeof first === 'object' && first !== null ? { ...bindings, ...first } : first,
        ...rest
      );
    };
    return {
      info: (...args: unknown[]) => emit(info, args),
      warn: (...args: unknown[]) => emit(warn, args),
      error: (...args: unknown[]) => emit(error, args),
      child: (childBindings: Record<string, unknown>) => bind({ ...bindings, ...childBindings }),
    };
  };
  return { bind, error, info, warn };
});

vi.mock('axios', () => ({
  default: {
    request: axiosMock.request,
    isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
  },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: logSink.bind(),
  createRequestLogger: (requestId: string) => logSink.bind({ requestId }),
}));

const STRUCTURED_REQUEST_ID = 'a6000000-0000-4000-8000-000000000060';
const FREE_TEXT_REQUEST_ID = 'a6000000-0000-4000-8000-000000000061';
const OWNED_REQUEST_IDS = [STRUCTURED_REQUEST_ID, FREE_TEXT_REQUEST_ID] as const;
const SECRET = 'Bearer t060-secret-header-canary';
const RAW_BODY = 't060-raw-upstream-body-canary';
const RAW_METADATA = 't060-raw-upstream-metadata-canary';
const FREE_TEXT = 'content policy violation refusal detected only in free text';
const COMPOSED_BASE_PROMPT = 'Provide a complete, accurate answer to the user prompt.';
const COMPOSED_CONSOLIDATOR_PROMPT =
  'Consolidate the available model answers into one final answer.';
const ECONOMIC_FIELDS = [
  'billing',
  'cost',
  'credit',
  'budget',
  'currency',
  'price',
  'economic',
] as const;
const SLOTS = ['base-1', 'base-2', 'base-3', 'consolidator'] as const;
const DEFINITIONS = SLOTS.map(slot => ({
  slot,
  deploymentId: `t060-openrouter-${slot}`,
  displayName: `T060 OpenRouter ${slot}`,
  providerId: 'openrouter',
  modelId: `t060/openrouter/${slot}`,
  supportsWebSearch: true,
  credentialEnv: 'OPENROUTER_API_KEY',
  contextLimitTokens: 1_000_000,
  maxOutputTokens: 4_096,
  inputModalities: ['text'],
  outputModalities: ['text'],
})) satisfies readonly DeploymentDefinition[];
const ASSIGNMENT = Object.fromEntries(
  DEFINITIONS.map(({ slot, deploymentId }) => [slot, deploymentId])
) as DeploymentAssignment;

describe('OpenRouter observability safety across HTTP, collaborators and PostgreSQL', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool({ schema: 'observability_safety' });
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await deleteOwnedConversationRequests(pool, OWNED_REQUEST_IDS);
  });

  afterEach(async () => {
    await deleteOwnedConversationRequests(pool, OWNED_REQUEST_IDS);
  });

  afterAll(async () => {
    await dropIntegrationSchema(pool);
    await pool?.end();
  });

  it.each([
    {
      name: 'structured non-empty 403 reasons',
      clientRequestId: STRUCTURED_REQUEST_ID,
      expectedCode: 'content_blocked',
      metadata: {
        reasons: [RAW_METADATA],
        billing: { currency: 'USD', credit: 123, cost: 45, budget: 67, price: 89 },
      },
    },
    {
      name: 'free-text-only 403 with empty structural arrays',
      clientRequestId: FREE_TEXT_REQUEST_ID,
      expectedCode: 'provider_error',
      metadata: { reasons: [], patterns: [], economic: RAW_METADATA },
    },
  ])(
    'persists and exposes only the safe closed failure for $name',
    async ({ clientRequestId, expectedCode, metadata }) => {
      axiosMock.request.mockImplementation(async (transport: { data?: { model?: string } }) => {
        if (transport.data?.model === DEFINITIONS[0].modelId) {
          throw {
            isAxiosError: true,
            response: {
              status: 403,
              headers: { authorization: SECRET, 'x-upstream-secret': RAW_BODY },
              data: {
                error: { message: `${FREE_TEXT}: ${RAW_BODY}`, metadata },
                raw: RAW_BODY,
              },
            },
          };
        }
        return {
          data: {
            choices: [{ message: { content: `safe ${transport.data?.model} response` } }],
            usage: { prompt_tokens: 111, completion_tokens: 222, total_tokens: 333 },
            billing: RAW_METADATA,
            cost: 999,
          },
        };
      });

      const registry = createProviderRegistry({
        OPENROUTER_API_KEY: 't060-integration-key',
        LLM_PROVIDER_TIMEOUT_MS: 1_000,
      });
      const backend = createIntegrationBackend(pool, registry, DEFINITIONS);

      try {
        const created = await request(backend.app).post('/api/v1/conversations').send({
          clientRequestId,
          prompt: 'T060 user prompt remains normal conversation data.',
          deploymentIds: ASSIGNMENT,
        });
        expect(created.status).toBe(201);

        await backend.conversationService.stop();

        const detail = await request(backend.app).get(
          `/api/v1/conversations/${created.body.conversation.id}/turns/${created.body.turn.id}`
        );
        expect(detail.status).toBe(200);
        expect(detail.body.conversation.hasWorkInProgress).toBe(false);
        expect(detail.body.turn.responses).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              slot: 'base-1',
              status: 'failed',
              error: { code: expectedCode, message: 'OpenRouter request failed.' },
              recoverable: false,
              content: null,
            }),
          ])
        );

        const rows = await pool.query<{
          slot: ResponseSlot;
          status: string;
          errorCode: string | null;
          errorMessage: string | null;
          errorRecoverable: boolean;
          content: string | null;
          metadata: Record<string, unknown> | null;
        }>(
          `SELECT mr.slot, mr.status, mr.error_code AS "errorCode",
                  mr.error_message AS "errorMessage",
                  mr.error_recoverable AS "errorRecoverable", mr.content, mr.metadata
             FROM model_responses mr
             JOIN turns t ON t.id = mr.turn_id
            WHERE t.id = $1
            ORDER BY mr.slot`,
          [created.body.turn.id]
        );
        const failed = rows.rows.find(row => row.slot === 'base-1');
        expect(failed).toMatchObject({
          status: 'failed',
          errorCode: expectedCode,
          errorMessage: 'OpenRouter request failed.',
          errorRecoverable: false,
          content: null,
        });

        const observables = JSON.stringify({
          api: detail.body,
          rows: rows.rows,
          logs: [logSink.info.mock.calls, logSink.warn.mock.calls, logSink.error.mock.calls],
        }).toLowerCase();
        for (const canary of [
          SECRET,
          RAW_BODY,
          RAW_METADATA,
          FREE_TEXT,
          COMPOSED_BASE_PROMPT,
          COMPOSED_CONSOLIDATOR_PROMPT,
        ]) {
          expect(observables).not.toContain(canary.toLowerCase());
        }
        expect(observables).not.toMatch(/inputtokens|outputtokens|totaltokens|prompt_tokens/);
        for (const field of ECONOMIC_FIELDS) expect(observables).not.toContain(field);
      } finally {
        await backend.conversationService.stop();
      }
    }
  );
});
