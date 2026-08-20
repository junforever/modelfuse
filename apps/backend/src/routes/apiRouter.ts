import { Router } from 'express';

import type { ConversationService } from '../services/conversations/ConversationService.js';
import type { TurnEventPublisher } from '../services/conversations/turnEventPublisher.js';
import type { ModelCatalogService } from '../services/llm/ModelCatalogService.js';
import type { ProviderRegistry } from '../types/llm.js';
import { createConversationRoutes } from './conversations/conversationRoutes.js';
import { createModelCatalogRoutes } from './modelCatalogRoutes.js';

export interface ApiDependencies {
  conversationService: ConversationService;
  turnEventPublisher: TurnEventPublisher;
  providerRegistry?: ProviderRegistry;
  modelCatalogService?: ModelCatalogService;
}

export function createApiRouter(dependencies?: ApiDependencies): Router {
  const router = Router();
  if (dependencies) router.use('/conversations', createConversationRoutes(dependencies));
  if (dependencies?.modelCatalogService) {
    router.use('/model-catalog', createModelCatalogRoutes(dependencies.modelCatalogService));
  }
  return router;
}
