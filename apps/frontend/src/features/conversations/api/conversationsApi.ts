import { isAxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import type { ZodType } from 'zod';

import {
  apiErrorSchema,
  conversationDetailSchema,
  conversationPageSchema,
  conversationSummarySchema,
  conversationTurnResponseSchema,
  modelCatalogResponseSchema,
  turnPageSchema,
  turnSnapshotResponseSchema,
} from '../schemas/conversationSchemas';
import type {
  ApiError,
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
  ConversationTurnResponse,
  CreateConversationRequest,
  CreateTurnRequest,
  ModelCatalogResponse,
  RenameConversationRequest,
  ResponseSlot,
  TurnPage,
  TurnSnapshotResponse,
} from '../types/conversation';

const unknownApiError: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'No se pudo completar la solicitud',
  requestId: 'unavailable',
};

async function validated<T>(
  request: Promise<AxiosResponse<unknown>>,
  schema: ZodType<T>
): Promise<T> {
  let response: AxiosResponse<unknown>;
  try {
    response = await request;
  } catch (error) {
    if (!isAxiosError(error)) throw error;

    const apiError = apiErrorSchema.safeParse(error.response?.data);
    throw apiError.success ? apiError.data : unknownApiError;
  }

  const parsed = schema.safeParse(response.data);
  if (!parsed.success) throw unknownApiError;
  return parsed.data;
}

async function completed(request: Promise<AxiosResponse<unknown>>): Promise<void> {
  try {
    await request;
  } catch (error) {
    if (!isAxiosError(error)) throw error;

    const apiError = apiErrorSchema.safeParse(error.response?.data);
    throw apiError.success ? apiError.data : unknownApiError;
  }
}

export function listConversations(
  client: AxiosInstance,
  cursor: string | null,
  signal?: AbortSignal
): Promise<ConversationPage> {
  return validated(
    client.get('/conversations', { params: cursor ? { cursor } : undefined, signal }),
    conversationPageSchema
  );
}

export function listAvailableDeployments(
  client: AxiosInstance,
  signal?: AbortSignal
): Promise<ModelCatalogResponse> {
  return validated(client.get('/model-catalog', { signal }), modelCatalogResponseSchema);
}

export function getConversation(
  client: AxiosInstance,
  conversationId: string,
  signal?: AbortSignal
): Promise<ConversationDetail> {
  return validated(
    client.get(`/conversations/${conversationId}`, { signal }),
    conversationDetailSchema
  );
}

export function listConversationTurns(
  client: AxiosInstance,
  conversationId: string,
  before: string | null,
  signal?: AbortSignal
): Promise<TurnPage> {
  return validated(
    client.get(`/conversations/${conversationId}/turns`, {
      params: before ? { before } : undefined,
      signal,
    }),
    turnPageSchema
  );
}

export function renameConversation(
  client: AxiosInstance,
  conversationId: string,
  payload: RenameConversationRequest
): Promise<ConversationSummary> {
  return validated(
    client.patch(`/conversations/${conversationId}`, payload),
    conversationSummarySchema
  );
}

export function deleteConversation(client: AxiosInstance, conversationId: string): Promise<void> {
  return completed(client.delete(`/conversations/${conversationId}`));
}

export function createConversation(
  client: AxiosInstance,
  payload: CreateConversationRequest
): Promise<ConversationTurnResponse> {
  return validated(client.post('/conversations', payload), conversationTurnResponseSchema);
}

export function createTurn(
  client: AxiosInstance,
  conversationId: string,
  payload: CreateTurnRequest
): Promise<ConversationTurnResponse> {
  return validated(
    client.post(`/conversations/${conversationId}/turns`, payload),
    conversationTurnResponseSchema
  );
}

export function getTurnSnapshot(
  client: AxiosInstance,
  conversationId: string,
  turnId: string
): Promise<TurnSnapshotResponse> {
  return validated(
    client.get(`/conversations/${conversationId}/turns/${turnId}`),
    turnSnapshotResponseSchema
  );
}

export function retryResponse(
  client: AxiosInstance,
  conversationId: string,
  turnId: string,
  slot: ResponseSlot
): Promise<ConversationTurnResponse> {
  return validated(
    client.post(`/conversations/${conversationId}/turns/${turnId}/responses/${slot}/retry`),
    conversationTurnResponseSchema
  );
}

export function continueWithoutResponse(
  client: AxiosInstance,
  conversationId: string,
  turnId: string,
  slot: ResponseSlot
): Promise<ConversationTurnResponse> {
  return validated(
    client.post(
      `/conversations/${conversationId}/turns/${turnId}/responses/${slot}/continue-without`
    ),
    conversationTurnResponseSchema
  );
}
