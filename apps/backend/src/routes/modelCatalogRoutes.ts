import { Router } from 'express';

import { createModelCatalogController } from '../controllers/modelCatalogController.js';
import type { ModelCatalogService } from '../services/llm/ModelCatalogService.js';

export function createModelCatalogRoutes(service: ModelCatalogService): Router {
  const router = Router();
  router.get('/', createModelCatalogController(service));
  return router;
}
