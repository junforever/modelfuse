import type { NextFunction, Request, Response } from 'express';
import { logger } from '#utils/logger';
import type { ApiError } from '../../types/apiError.js';
import { ConversationError } from '../../services/conversations/conversationErrors.js';
import { InvalidCursorError } from '../../utils/cursor.js';
/**
 * Global error handling middleware for Express applications.
 *
 * This middleware captures any unhandled errors that occur during the
 * request/response lifecycle. It logs the error with full contextual
 * information (requestId, user, tenant, route, etc.) and ensures that
 * the client receives a safe, generic error response.
 *
 * Usage:
 * - Place this middleware after all routes and other middlewares:
 *   `app.use(globalErrorHandler);`
 *
 * Invocation:
 * - It is automatically triggered when a route or middleware calls
 *   `next(error)` with an Error object.
 * - It also catches synchronous exceptions thrown inside route handlers:
 *   ```ts
 *   app.get("/example", (req, res) => {
 *     throw new Error("Something went wrong"); // handled by globalErrorHandler
 *   });
 *   ```
 *
 * Behavior:
 * - Logs the error with structured context using `req.log` or a default logger.
 * - Ensures that a successful status code (200) is never returned in case of error.
 *   If `res.statusCode` is still 200, it is replaced with 500 (Internal Server Error).
 * - Sends a JSON response with a generic error message and the `requestId`
 *   so support teams can correlate logs with client reports.
 *
 */

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const log = req.log || logger;

  log.error({
    message: 'Unhandled error in request',
    operation: 'global_error_handler',
    method: req.method,
    requestId: req.requestId,
  });

  const expected = err instanceof ConversationError ? err : undefined;
  const invalidCursor = err instanceof InvalidCursorError;
  const response: ApiError = {
    code: invalidCursor ? 'INVALID_CURSOR' : expected?.code ?? 'INTERNAL_ERROR',
    message: invalidCursor
      ? 'The cursor is invalid.'
      : expected?.message ?? 'An unexpected error occurred. Please try again later.',
    requestId: req.requestId,
  };

  res.status(invalidCursor ? 400 : expected?.status ?? 500).json(response);
}
