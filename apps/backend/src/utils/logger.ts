import { fileURLToPath } from 'node:url';

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const logFile = fileURLToPath(new URL('../../logs/backend.log', import.meta.url));

/**
 * Central application logger using Pino.
 *
 * - Configures log level from LOG_LEVEL env var (default: "info").
 * - Adds base metadata: service name, environment, process id.
 * - In development: uses pino-pretty for human-readable logs.
 * - In production: outputs structured JSON for ingestion by log platforms.
 *
 * Use this logger for all application-wide logging needs.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  messageKey: 'message',
  base: {
    service: 'kb-agent-api',
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
  },
  transport: {
    targets: [
      {
        target: 'pino/file',
        options: {
          destination: logFile,
          mkdir: true,
        },
      },
      ...(isDev
        ? [
            {
              target: 'pino-pretty',
              options: {
                colorize: true,
                destination: 1,
                ignore: 'pid,hostname',
                levelFirst: true,
                messageKey: 'message',
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              },
            },
          ]
        : []),
    ],
  },
});

/**
 * Creates a child logger scoped to a specific request.
 *
 * @param requestId - Unique identifier for the request (e.g. UUID or header x-request-id).
 * @param userId - Optional user identifier associated with the request.
 * @param tenantId - Optional tenant identifier for multi-tenant context.
 * @returns A Pino child logger that automatically includes requestId, userId, and tenantId in all log entries.
 *
 * Usage:
 * - Call inside middleware to attach `req.log` for request-scoped logging.
 * - Ensures all logs for a request can be correlated by requestId.
 */
export function createRequestLogger(requestId: string, userId?: string, tenantId?: string) {
  return logger.child({
    requestId,
    userId: userId || null,
    tenantId: tenantId || null,
  });
}
