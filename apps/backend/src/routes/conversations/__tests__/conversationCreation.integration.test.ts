import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEPLOYMENT_CATALOG } from '../../../infrastructure/llm/deploymentCatalog.js';
import {
  ControlledLlmProvider,
  deferred,
} from '../../../test/integration/controlledLlmProviders.js';
import { createIntegrationBackend } from '../../../test/integration/createIntegrationBackend.js';
import {
  assertModelFuseSchema,
  createIntegrationPool,
  deleteOwnedConversationRequests,
} from '../../../test/integration/testDatabase.js';
import type {
  ConversationDeploymentSummary,
  DeploymentDefinition,
  ResponseSlot,
} from '../../../types/conversations.js';
import type { ProviderRegistry } from '../../../types/llm.js';

const CLIENT_REQUEST_ID = '10000000-0000-4000-8000-000000000030';
const PROMPT = 'Compare the four explicit deployments.';
const DEPLOYMENT_IDS = {
  'base-1': 'openai-5.6-terra',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
} as const;
const SLOT_ORDER = ['base-1', 'base-2', 'base-3', 'consolidator'] as const;
const SELECTED_DEFINITIONS = SLOT_ORDER.map(slot => definition(DEPLOYMENT_IDS[slot]));
const PUBLIC_SUMMARIES = SLOT_ORDER.map((slot, index) => {
  const selected = SELECTED_DEFINITIONS[index]!;
  return {
    slot,
    deploymentId: selected.deploymentId,
    providerId: selected.providerId,
    modelId: selected.modelId,
    displayName: selected.displayName,
  };
}) as readonly ConversationDeploymentSummary[];

describe('explicit conversation creation across REST, PostgreSQL, and deterministic adapters', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool();
    await assertModelFuseSchema(pool);
  });

  beforeEach(async () => {
    await deleteOwnedConversationRequests(pool, [CLIENT_REQUEST_ID]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deleteOwnedConversationRequests(pool, [CLIENT_REQUEST_ID]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('commits the complete first turn before launching bases, then launches the consolidator last', async () => {
    const baseGates = [deferred(), deferred(), deferred()] as const;
    const openai = new ControlledLlmProvider('base-1');
    const google = new ControlledLlmProvider('base-2');
    const openrouter = new ControlledLlmProvider('base-3', [], {
      providerId: 'openrouter',
      provider: 'openrouter-fake',
      model: 'openrouter-test-model',
    });
    openai.enqueueBlocked(baseGates[0].promise, 'OpenAI base response');
    google.enqueueBlocked(baseGates[1].promise, 'Google base response');
    openrouter.enqueueBlocked(baseGates[2].promise, 'OpenRouter base response');
    openrouter.enqueueResult('OpenRouter consolidated response');

    const providerRegistry: ProviderRegistry = { openai, google, openrouter };
    const callOrder: ResponseSlot[] = [];
    const statesAtProviderStart: Array<{
      slot: ResponseSlot;
      state: Awaited<ReturnType<typeof readCreationState>>;
    }> = [];
    observeProviderStarts(openai, pool, callOrder, statesAtProviderStart);
    observeProviderStarts(google, pool, callOrder, statesAtProviderStart);
    observeProviderStarts(openrouter, pool, callOrder, statesAtProviderStart);

    const backend = createIntegrationBackend(pool, providerRegistry);

    try {
      const created = await request(backend.app).post('/api/v1/conversations').send({
        clientRequestId: CLIENT_REQUEST_ID,
        prompt: PROMPT,
        deploymentIds: DEPLOYMENT_IDS,
      });

      expect(created.status).toBe(201);
      expect(created.body.conversation.deployments).toEqual(PUBLIC_SUMMARIES);
      expect(created.body.turn).toMatchObject({
        clientRequestId: CLIENT_REQUEST_ID,
        ordinal: 1,
        prompt: PROMPT,
        responses: [
          { slot: 'base-1', role: 'base', provider: 'openai', model: 'gpt-5.6-terra' },
          { slot: 'base-2', role: 'base', provider: 'google', model: 'gemini-3.7-flash' },
          {
            slot: 'base-3',
            role: 'base',
            provider: 'openrouter',
            model: 'minimax/minimax-m3',
          },
          {
            slot: 'consolidator',
            role: 'consolidator',
            provider: 'openrouter',
            model: 'qwen/qwen3.8-max',
          },
        ],
      });

      await Promise.all([
        openai.waitUntilCalled(),
        google.waitUntilCalled(),
        openrouter.waitUntilCalled(),
      ]);

      expect(callOrder).toHaveLength(3);
      expect(new Set(callOrder)).toEqual(new Set<ResponseSlot>(['base-1', 'base-2', 'base-3']));
      expect(openrouter.calls.map(call => call.slot)).toEqual(['base-3']);
      expect(statesAtProviderStart).toHaveLength(3);
      statesAtProviderStart.forEach(({ state }) => expectCompleteCommittedState(state));

      const detail = await request(backend.app).get(
        `/api/v1/conversations/${created.body.conversation.id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.deployments).toEqual(PUBLIC_SUMMARIES);
      expect(Object.keys(detail.body.deployments[0])).toEqual([
        'slot',
        'deploymentId',
        'providerId',
        'modelId',
        'displayName',
      ]);

      baseGates.forEach(gate => gate.resolve());
      await openrouter.waitUntilCalled(2);
      expect(callOrder.slice(0, 3).sort()).toEqual(['base-1', 'base-2', 'base-3']);
      expect(callOrder[3]).toBe('consolidator');
      expect(openrouter.calls.map(call => call.slot)).toEqual(['base-3', 'consolidator']);
    } finally {
      baseGates.forEach(gate => gate.resolve());
      await backend.conversationService.stop();
    }
  });
});

function observeProviderStarts(
  provider: ControlledLlmProvider,
  pool: Pool,
  callOrder: ResponseSlot[],
  observations: Array<{
    slot: ResponseSlot;
    state: Awaited<ReturnType<typeof readCreationState>>;
  }>,
): void {
  const generate = provider.generate.bind(provider);
  vi.spyOn(provider, 'generate').mockImplementation(async input => {
    callOrder.push(input.slot);
    observations.push({ slot: input.slot, state: await readCreationState(pool) });
    return generate(input);
  });
}

async function readCreationState(pool: Pool) {
  const conversation = await pool.query<{ id: string }>(
    'SELECT id FROM conversations WHERE create_client_request_id = $1',
    [CLIENT_REQUEST_ID],
  );
  const conversationId = conversation.rows[0]?.id ?? null;
  const deployments = conversationId
    ? await pool.query<{
        slot: ResponseSlot;
        deploymentId: string;
        providerId: string;
        modelId: string;
        displayName: string;
        contextLimitTokens: number;
        maxOutputTokens: number;
        inputModalities: string[];
        outputModalities: string[];
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT slot,
                deployment_id AS "deploymentId",
                provider_id AS "providerId",
                model_id AS "modelId",
                display_name AS "displayName",
                context_limit_tokens AS "contextLimitTokens",
                max_output_tokens AS "maxOutputTokens",
                input_modalities AS "inputModalities",
                output_modalities AS "outputModalities",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
           FROM conversation_deployments
          WHERE conversation_id = $1
          ORDER BY CASE slot
            WHEN 'base-1' THEN 1 WHEN 'base-2' THEN 2
            WHEN 'base-3' THEN 3 WHEN 'consolidator' THEN 4 END`,
        [conversationId],
      )
    : { rows: [] };
  const turns = conversationId
    ? await pool.query<{ id: string }>('SELECT id FROM turns WHERE conversation_id = $1', [
        conversationId,
      ])
    : { rows: [] };
  const responses = turns.rows[0]
    ? await pool.query<{
        slot: ResponseSlot;
        role: string;
        provider: string;
        model: string;
      }>(
        `SELECT slot, role, provider, model
           FROM model_responses
          WHERE turn_id = $1
          ORDER BY CASE slot
            WHEN 'base-1' THEN 1 WHEN 'base-2' THEN 2
            WHEN 'base-3' THEN 3 WHEN 'consolidator' THEN 4 END`,
        [turns.rows[0].id],
      )
    : { rows: [] };

  return {
    conversations: conversation.rowCount ?? 0,
    turns: turns.rowCount ?? 0,
    deployments: deployments.rows,
    responses: responses.rows,
  };
}

function expectCompleteCommittedState(state: Awaited<ReturnType<typeof readCreationState>>): void {
  expect(state.conversations).toBe(1);
  expect(state.turns).toBe(1);
  expect(
    state.deployments.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row),
  ).toEqual(
    SLOT_ORDER.map((slot, index) => {
      const selected = SELECTED_DEFINITIONS[index]!;
      return {
        slot,
        deploymentId: selected.deploymentId,
        providerId: selected.providerId,
        modelId: selected.modelId,
        displayName: selected.displayName,
        contextLimitTokens: selected.contextLimitTokens,
        maxOutputTokens: selected.maxOutputTokens,
        inputModalities: [...selected.inputModalities],
        outputModalities: [...selected.outputModalities],
      };
    }),
  );
  state.deployments.forEach(row => expect(row.updatedAt).toEqual(row.createdAt));
  expect(state.responses).toEqual([
    { slot: 'base-1', role: 'base', provider: 'openai', model: 'gpt-5.6-terra' },
    { slot: 'base-2', role: 'base', provider: 'google', model: 'gemini-3.7-flash' },
    {
      slot: 'base-3',
      role: 'base',
      provider: 'openrouter',
      model: 'minimax/minimax-m3',
    },
    {
      slot: 'consolidator',
      role: 'consolidator',
      provider: 'openrouter',
      model: 'qwen/qwen3.8-max',
    },
  ]);
}

function definition(deploymentId: string): DeploymentDefinition {
  const selected = DEPLOYMENT_CATALOG.find(item => item.deploymentId === deploymentId);
  if (!selected) throw new Error(`Missing T030 deployment fixture: ${deploymentId}`);
  return selected;
}
