import { Router } from 'express';

import { createConversationController } from '../../controllers/conversations/conversationController.js';
import { createTurnEventsController } from '../../controllers/conversations/turnEventsController.js';
import {
  createConversationBodySchema,
  createTurnBodySchema,
  conversationIdParamsSchema,
  emptyConversationOperationBodySchema,
  listConversationsQuerySchema,
  listTurnsQuerySchema,
  renameConversationBodySchema,
  responseSlotParamsSchema,
  turnIdParamsSchema,
} from '../../middleware/validation/conversationSchemas.js';
import { validateRequest } from '../../middleware/validation/validateRequest.js';
import type { ConversationService } from '../../services/conversations/ConversationService.js';
import type { TurnEventPublisher } from '../../services/conversations/turnEventPublisher.js';

export function createConversationRoutes(dependencies: {
  conversationService: ConversationService;
  turnEventPublisher: TurnEventPublisher;
}): Router {
  const router = Router();
  const controller = createConversationController(dependencies.conversationService);

  router.get(
    '/',
    validateRequest({ query: listConversationsQuerySchema }),
    controller.listConversations
  );
  router.post(
    '/',
    validateRequest({ body: createConversationBodySchema }),
    controller.createConversation
  );
  router.get(
    '/:conversationId',
    validateRequest({ params: conversationIdParamsSchema }),
    controller.getConversation
  );
  router.patch(
    '/:conversationId',
    validateRequest({ params: conversationIdParamsSchema, body: renameConversationBodySchema }),
    controller.renameConversation
  );
  router.delete(
    '/:conversationId',
    validateRequest({
      params: conversationIdParamsSchema,
      body: emptyConversationOperationBodySchema,
    }),
    controller.deleteConversation
  );
  router.get(
    '/:conversationId/turns',
    validateRequest({ params: conversationIdParamsSchema, query: listTurnsQuerySchema }),
    controller.listTurns
  );
  router.post(
    '/:conversationId/turns',
    validateRequest({ params: conversationIdParamsSchema, body: createTurnBodySchema }),
    controller.createTurn
  );
  router.get(
    '/:conversationId/turns/:turnId',
    validateRequest({ params: turnIdParamsSchema }),
    controller.getTurn
  );
  router.get(
    '/:conversationId/turns/:turnId/events',
    validateRequest({ params: turnIdParamsSchema }),
    createTurnEventsController(dependencies.conversationService, dependencies.turnEventPublisher)
  );
  router.post(
    '/:conversationId/turns/:turnId/responses/:slot/retry',
    validateRequest({
      params: responseSlotParamsSchema,
      body: emptyConversationOperationBodySchema,
    }),
    controller.retryResponse
  );
  router.post(
    '/:conversationId/turns/:turnId/responses/:slot/continue-without',
    validateRequest({
      params: responseSlotParamsSchema,
      body: emptyConversationOperationBodySchema,
    }),
    controller.continueWithout
  );

  return router;
}
