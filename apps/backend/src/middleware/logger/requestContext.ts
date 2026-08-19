import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createRequestLogger } from '#utils/logger';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;

  // Create a logger with context for this request
  req.log = createRequestLogger(requestId);

  // Request input log
  req.log.info({
    message: 'Request started',
    operation: 'request_started',
    method: req.method,
    route: req.route?.path || req.path,
  });

  const startTime = Date.now();

  // Request output log after completion
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    req.log.info({
      message: 'Request completed',
      operation: 'request_completed',
      method: req.method,
      route: req.route?.path || req.path,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
