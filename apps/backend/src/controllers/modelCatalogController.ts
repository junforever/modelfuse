import type { NextFunction, Request, Response } from 'express';

import type { ModelCatalogService } from '../services/llm/ModelCatalogService.js';

export function createModelCatalogController(service: ModelCatalogService) {
  return async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json({ items: service.listAvailableDeployments() });
    } catch (error) {
      next(error);
    }
  };
}
