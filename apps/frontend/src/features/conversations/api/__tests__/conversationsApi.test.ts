import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  continueWithoutResponse,
  createConversation,
  getConversation,
  getTurnSnapshot,
  listAvailableDeployments,
  retryResponse,
} from '../conversationsApi';
import { createApiClient } from '../client';
import {
  clientRequestId,
  conversationId,
  eventTime,
  turnFixture,
  turnId,
} from '../../../../test/conversation-fixtures';
import type {
  ConversationDetail,
  DeploymentIds,
  ModelCatalogResponse,
} from '../../types/conversation';

const conversation: ConversationDetail = {
  id: conversationId,
  title: 'Comparación inicial',
  hasWorkInProgress: true,
  deployments: [
    {
      slot: 'base-1',
      deploymentId: 'deployment-1',
      providerId: 'openai',
      modelId: 'model-1',
      displayName: 'Model 1',
    },
    {
      slot: 'base-2',
      deploymentId: 'deployment-2',
      providerId: 'google',
      modelId: 'model-2',
      displayName: 'Model 2',
    },
    {
      slot: 'base-3',
      deploymentId: 'deployment-3',
      providerId: 'openrouter',
      modelId: 'model-3',
      displayName: 'Model 3',
    },
    {
      slot: 'consolidator',
      deploymentId: 'deployment-4',
      providerId: 'openrouter',
      modelId: 'model-4',
      displayName: 'Model 4',
    },
  ],
  createdAt: eventTime,
  updatedAt: eventTime,
};
const conversationTurn = { conversation, turn: turnFixture() };
const deploymentIds: DeploymentIds = {
  'base-1': 'deployment-1',
  'base-2': 'deployment-2',
  'base-3': 'deployment-3',
  consolidator: 'deployment-4',
};
const catalog: ModelCatalogResponse = {
  items: conversation.deployments.map(({ slot: _slot, ...deployment }, index) => ({
    ...deployment,
    contextLimitTokens: 100_000 + index,
    maxOutputTokens: 8_000 + index,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
  })),
};
const snapshot = {
  conversation: {
    id: conversationId,
    hasWorkInProgress: true,
  },
  turn: turnFixture(),
};

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  return {
    data,
    status,
    statusText: status === 202 ? 'Accepted' : 'OK',
    headers: {},
    config,
  };
}

describe('conversations API contract', () => {
  it('maps catalog, detail, create and turn actions to their validated REST contracts', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    const adapter: AxiosAdapter = async config => {
      requests.push(config);
      if (config.url === '/model-catalog') return response(config, catalog);
      if (config.url === `/conversations/${conversationId}`) return response(config, conversation);
      if (config.method === 'get') return response(config, snapshot);
      if (config.url?.endsWith('/continue-without')) {
        return response(config, conversationTurn);
      }
      return response(config, conversationTurn, 202);
    };
    const client = createApiClient({
      baseURL: 'https://api.example.test/api/v1',
      adapter,
    });

    await expect(listAvailableDeployments(client)).resolves.toEqual(catalog);
    await expect(getConversation(client, conversationId)).resolves.toEqual(conversation);
    await expect(
      createConversation(client, { clientRequestId, prompt: 'Primer prompt', deploymentIds })
    ).resolves.toEqual(conversationTurn);
    await expect(getTurnSnapshot(client, conversationId, turnId)).resolves.toEqual(snapshot);
    await expect(retryResponse(client, conversationId, turnId, 'base-1')).resolves.toEqual(
      conversationTurn
    );
    await expect(
      continueWithoutResponse(client, conversationId, turnId, 'base-2')
    ).resolves.toEqual(conversationTurn);

    expect(
      requests.map(config => ({
        method: config.method,
        url: config.url,
        body: config.data === undefined ? undefined : JSON.parse(String(config.data)),
      }))
    ).toEqual([
      {
        method: 'get',
        url: '/model-catalog',
        body: undefined,
      },
      {
        method: 'get',
        url: `/conversations/${conversationId}`,
        body: undefined,
      },
      {
        method: 'post',
        url: '/conversations',
        body: { clientRequestId, prompt: 'Primer prompt', deploymentIds },
      },
      {
        method: 'get',
        url: `/conversations/${conversationId}/turns/${turnId}`,
        body: undefined,
      },
      {
        method: 'post',
        url: `/conversations/${conversationId}/turns/${turnId}/responses/base-1/retry`,
        body: undefined,
      },
      {
        method: 'post',
        url: `/conversations/${conversationId}/turns/${turnId}/responses/base-2/continue-without`,
        body: undefined,
      },
    ]);
  });

  it('maps a malformed success payload to one stable safe client error', async () => {
    const malformed = {
      ...conversationTurn,
      turn: {
        ...conversationTurn.turn,
        responses: conversationTurn.turn.responses.slice(0, 3),
        schemaCanary: 'schema-detail-must-not-leak',
      },
    };
    const adapter: AxiosAdapter = async config => response(config, malformed, 202);
    const client = createApiClient({ baseURL: '/api/v1', adapter });

    let failure: unknown;
    try {
      await createConversation(client, { clientRequestId, prompt: 'Primer prompt' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'No se pudo completar la solicitud',
      requestId: 'unavailable',
    });
    expect(JSON.stringify(failure)).not.toMatch(/responses|schema|ZodError/i);
  });

  it('falls back to one safe error when the server error payload is not strictly public', async () => {
    const apiError = {
      code: 'CONVERSATION_BUSY',
      message: 'La conversación está procesando otro turno',
      requestId: 'request-123',
    };
    const adapter: AxiosAdapter = async config => {
      const error = new AxiosError('unsafe transport detail', 'ERR_BAD_REQUEST', config);
      error.response = response(
        config,
        { ...apiError, debug: 'database-password-must-not-leak' },
        409
      );
      throw error;
    };
    const client = createApiClient({ baseURL: '/api/v1', adapter });

    let failure: unknown;
    try {
      await retryResponse(client, conversationId, turnId, 'base-1');
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'No se pudo completar la solicitud',
      requestId: 'unavailable',
    });
    expect(JSON.stringify(failure)).not.toContain('database-password-must-not-leak');
  });
});
