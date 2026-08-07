import type { NextFunction, Request, Response } from 'express';

import type { CreateConversationBody } from '../../middleware/validation/conversationSchemas.js';
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

export function createConversationController(service: ConversationService) {
  return {
    createConversation: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = (request as ValidatedRequest).validatedBody as CreateConversationBody;
        response.status(202).json(await service.createConversation(body));
      } catch (error) {
        next(error);
      }
    },
    getTurn: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId, turnId } = (request as ValidatedRequest).validatedParams as TurnParams;
        response.json(await service.getTurn(conversationId, turnId));
      } catch (error) {
        next(error);
      }
    },
    retryResponse: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId, turnId, slot } = (request as ValidatedRequest).validatedParams as ResponseParams;
        response.status(202).json(await service.retryResponse(conversationId, turnId, slot));
      } catch (error) {
        next(error);
      }
    },
    continueWithout: async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { conversationId, turnId, slot } = (request as ValidatedRequest).validatedParams as ResponseParams;
        response.json(await service.continueWithout(conversationId, turnId, slot));
      } catch (error) {
        next(error);
      }
    },
  };
}
