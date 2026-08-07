import { Router } from 'express';

import type { ConversationService } from '../services/conversations/ConversationService.js';
import type { TurnEventPublisher } from '../services/conversations/turnEventPublisher.js';
import { createConversationRoutes } from './conversations/conversationRoutes.js';

export interface ApiDependencies {
  conversationService: ConversationService;
  turnEventPublisher: TurnEventPublisher;
}

export function createApiRouter(dependencies?: ApiDependencies): Router {
  const router = Router();
  if (dependencies) router.use('/conversations', createConversationRoutes(dependencies));
  return router;
}
