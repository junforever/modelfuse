import type { NextFunction, Request, Response } from 'express';

import type {
  CreateConversationBody,
  CreateTurnBody,
  RenameConversationBody,
} from '../../middleware/validation/conversationSchemas.js';
import type { ValidatedRequest } from '../../middleware/validation/validateRequest.js';
import type { ConversationService } from '../../services/conversations/ConversationService.js';
import type { ResponseSlot } from '../../types/conversations.js';

interface ConversationParams {
  conversationId: string;
}

interface TurnParams extends ConversationParams {
  turnId: string;
}

interface ResponseParams extends TurnParams {
  slot: ResponseSlot;
}

interface ListConversationsQuery {
  cursor?: string;
}

interface ListTurnsQuery {
  before?: string;
}

export function createConversationController(service: ConversationService) {
  return {
    listConversations: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { cursor } = (request as ValidatedRequest).validatedQuery as ListConversationsQuery;
        response.json(await service.listConversations(cursor));
      } catch (error) {
        next(error);
      }
    },
    createConversation: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = (request as ValidatedRequest).validatedBody as CreateConversationBody;
        response.status(201).json(await service.createConversation(body));
      } catch (error) {
        next(error);
      }
    },
    getConversation: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId } = (request as ValidatedRequest)
          .validatedParams as ConversationParams;
        response.json(await service.getConversation(conversationId));
      } catch (error) {
        next(error);
      }
    },
    renameConversation: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId } = (request as ValidatedRequest)
          .validatedParams as ConversationParams;
        const body = (request as ValidatedRequest).validatedBody as RenameConversationBody;
        response.json(await service.renameConversation(conversationId, body));
      } catch (error) {
        next(error);
      }
    },
    deleteConversation: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId } = (request as ValidatedRequest)
          .validatedParams as ConversationParams;
        await service.deleteConversation(conversationId);
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
    listTurns: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId } = (request as ValidatedRequest)
          .validatedParams as ConversationParams;
        const { before } = (request as ValidatedRequest).validatedQuery as ListTurnsQuery;
        response.json(await service.listTurns(conversationId, before));
      } catch (error) {
        next(error);
      }
    },
    createTurn: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId } = (request as ValidatedRequest)
          .validatedParams as ConversationParams;
        const body = (request as ValidatedRequest).validatedBody as CreateTurnBody;
        response.status(202).json(await service.createTurn(conversationId, body));
      } catch (error) {
        next(error);
      }
    },
    getTurn: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId, turnId } = (request as ValidatedRequest)
          .validatedParams as TurnParams;
        response.json(await service.getTurn(conversationId, turnId));
      } catch (error) {
        next(error);
      }
    },
    retryResponse: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId, turnId, slot } = (request as ValidatedRequest)
          .validatedParams as ResponseParams;
        response.status(202).json(await service.retryResponse(conversationId, turnId, slot));
      } catch (error) {
        next(error);
      }
    },
    continueWithout: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId, turnId, slot } = (request as ValidatedRequest)
          .validatedParams as ResponseParams;
        response.json(await service.continueWithout(conversationId, turnId, slot));
      } catch (error) {
        next(error);
      }
    },
  };
}
