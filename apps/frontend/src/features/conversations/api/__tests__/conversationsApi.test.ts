import {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { describe, expect, it } from 'vitest';

import {
  continueWithoutResponse,
  createConversation,
  getTurnSnapshot,
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

const conversation = {
  id: conversationId,
  title: 'Comparación inicial',
  hasWorkInProgress: true,
  createdAt: eventTime,
  updatedAt: eventTime,
};
const conversationTurn = { conversation, turn: turnFixture() };
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
  it('maps create, snapshot, retry and Continue-without to their validated REST contracts', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    const adapter: AxiosAdapter = async config => {
      requests.push(config);
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

    await expect(
      createConversation(client, { clientRequestId, prompt: 'Primer prompt' })
    ).resolves.toEqual(conversationTurn);
    await expect(getTurnSnapshot(client, conversationId, turnId)).resolves.toEqual(snapshot);
    await expect(
      retryResponse(client, conversationId, turnId, 'openai')
    ).resolves.toEqual(conversationTurn);
    await expect(
      continueWithoutResponse(client, conversationId, turnId, 'google')
    ).resolves.toEqual(conversationTurn);

    expect(
      requests.map(config => ({
        method: config.method,
        url: config.url,
        body: config.data === undefined ? undefined : JSON.parse(String(config.data)),
      }))
    ).toEqual([
      {
        method: 'post',
        url: '/conversations',
        body: { clientRequestId, prompt: 'Primer prompt' },
      },
      {
        method: 'get',
        url: `/conversations/${conversationId}/turns/${turnId}`,
        body: undefined,
      },
      {
        method: 'post',
        url: `/conversations/${conversationId}/turns/${turnId}/responses/openai/retry`,
        body: undefined,
      },
      {
        method: 'post',
        url: `/conversations/${conversationId}/turns/${turnId}/responses/google/continue-without`,
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

  it('exposes only the validated safe API error returned by the server', async () => {
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
      await retryResponse(client, conversationId, turnId, 'openai');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject(apiError);
    expect(JSON.stringify(failure)).not.toContain('database-password-must-not-leak');
  });
});
