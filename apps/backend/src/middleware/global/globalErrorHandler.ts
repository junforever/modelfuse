import { Request, Response, NextFunction } from 'express';
import { logger } from '#utils/logger';
import { createResponse } from '#utils/responseHandler';
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
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const log = req.log || logger;

  // Structured error log - with all available context
  log.error({
    message: 'Unhandled error in request',
    operation: 'global_error_handler',
    error: {
      message: err.message,
      type: err.name,
      stack: err.stack,
    },
    method: req.method,
    route: req.route?.path || req.path,
    statusCode: res.statusCode,
    requestId: req.requestId,
    //FIXME: agregar la definición de user al Request
    userId: req.user?.id,
    tenantId: (req as any).tenantId,
    body: req.body ? '[REDACTED]' : undefined, // Never log raw bodies
    query: req.query,
  });

  // Response to client: NEVER stack trace, NEVER internal details
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  createResponse(res, {
    code: statusCode,
    success: false,
    message: 'An unexpected error occurred. Please try again later.',
    responseCode: 'UNEXPECTED_ERROR',
  });
}
