import { createResponse } from '#utils/responseHandler';
import { type Request, type Response } from 'express';
import { logger } from '#utils/logger';

export const invalidRoutes = (req: Request, res: Response) => {
  logger.warn({
    message: 'Invalid route',
    operation: 'invalid_route',
    requestId: req.requestId,
    error: { message: 'Invalid route' },
  });
  createResponse(res, {
    code: 404,
    success: false,
    message: 'Path not found',
    responseCode: 'INVALID_ROUTE',
  });
};
