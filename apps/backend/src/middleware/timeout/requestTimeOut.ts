import type { NextFunction, Request, Response } from 'express';
import { createResponse } from '#utils/responseHandler';
import { logger } from '#utils/logger';

/**
 * Request timeout middleware for Express.
 *
 * This middleware checks if the current request has exceeded
 * the configured timeout (`req.timedout` flag).
 *
 * Behavior:
 * - If the request has timed out, it logs a warning with contextual
 *   information (requestId, operation, error message).
 * - Responds to the client with HTTP 503 (Service Unavailable) and
 *   a standardized JSON error payload.
 * - If the request has not timed out, it simply calls `next()` to
 *   continue the middleware chain.
 *
 * Usage:
 * - Place this middleware after a timeout handler (e.g. `connect-timeout`)
 *   so that `req.timedout` is properly set.
 * - It is automatically invoked when a request exceeds the timeout limit.
 *
 */

export const requestTimeOut = (req: Request, res: Response, next: NextFunction) => {
  if (req.timedout) {
    logger.warn({
      message: 'Request timed out',
      operation: 'request_timeout',
      requestId: req.requestId,
      error: { message: 'Request timed out' },
    });
    return createResponse(res, {
      code: 503,
      success: false,
      message: 'Request timed out',
      responseCode: 'REQUEST_TIMEOUT',
    });
  }
  next();
};
