import { createResponse } from '#utils/responseHandler';
import { logger } from '#utils/logger';
import { type NextFunction, type Request, type Response } from 'express';

/**
 * JSON validation middleware for Express.
 *
 * This middleware handles errors thrown by the body parser when
 * the client sends malformed JSON in the request body.
 *
 * Behavior:
 * - If the error is a `SyntaxError` related to the body, it responds
 *   with HTTP 400 and a message indicating "Invalid JSON format".
 * - For any other error, it delegates to the global error handler
 *   or responds with a generic HTTP 500 server error.
 *
 * Usage:
 * - Place this middleware immediately after `express.json()`:
 *   ```ts
 *   app.use(express.json());
 *   app.use(jsonValidation);
 *   ```
 * - It is automatically invoked when the body parser encounters
 *   invalid JSON, or when another middleware calls `next(err)`.
 *
 */

export const jsonValidation = (
  err: SyntaxError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn({
      message: 'Invalid JSON in request body',
      operation: 'json_validation',
      requestId: req.requestId,
      error: { message: err.message },
    });

    return createResponse(res, {
      code: 400,
      success: false,
      message: 'Invalid JSON format.',
      responseCode: 'INVALID_JSON_FORMAT',
    });
  }

  // Other errors are passed to the global error handler
  return _next(err);
};
