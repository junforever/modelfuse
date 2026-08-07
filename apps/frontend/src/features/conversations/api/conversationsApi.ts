import { isAxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import type { ZodType } from 'zod';

import {
  apiErrorSchema,
  conversationTurnResponseSchema,
  turnSnapshotResponseSchema,
} from '../schemas/conversationSchemas';
import type {
  ApiError,
  ConversationTurnResponse,
  CreateConversationRequest,
  CreateTurnRequest,
  ResponseSlot,
  TurnSnapshotResponse,
} from '../types/conversation';

const unknownApiError: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'No se pudo completar la solicitud',
  requestId: 'unavailable',
};

async function validated<T>(request: Promise<AxiosResponse<unknown>>, schema: ZodType<T>): Promise<T> {
  try {
    return schema.parse((await request).data);
  } catch (error) {
    if (!isAxiosError(error)) throw error;

    const apiError = apiErrorSchema.safeParse(error.response?.data);
    throw apiError.success ? apiError.data : unknownApiError;
  }
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
