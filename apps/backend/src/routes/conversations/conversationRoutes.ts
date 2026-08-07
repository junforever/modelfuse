import { Router } from 'express';

import { createConversationController } from '../../controllers/conversations/conversationController.js';
import { createTurnEventsController } from '../../controllers/conversations/turnEventsController.js';
import {
  createConversationBodySchema,
  createTurnBodySchema,
  conversationIdParamsSchema,
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

  router.post(
    '/',
    validateRequest({ body: createConversationBodySchema }),
    controller.createConversation,
  );
  router.post(
    '/:conversationId/turns',
    validateRequest({ params: conversationIdParamsSchema, body: createTurnBodySchema }),
    controller.createTurn,
  );
  router.get(
    '/:conversationId/turns/:turnId',
    validateRequest({ params: turnIdParamsSchema }),
    controller.getTurn,
  );
  router.get(
    '/:conversationId/turns/:turnId/events',
    validateRequest({ params: turnIdParamsSchema }),
    createTurnEventsController(dependencies.conversationService, dependencies.turnEventPublisher),
  );
  router.post(
    '/:conversationId/turns/:turnId/responses/:slot/retry',
    validateRequest({ params: responseSlotParamsSchema }),
    controller.retryResponse,
  );
  router.post(
    '/:conversationId/turns/:turnId/responses/:slot/continue-without',
    validateRequest({ params: responseSlotParamsSchema }),
    controller.continueWithout,
  );

  return router;
}
