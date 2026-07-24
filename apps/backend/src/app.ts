import cors from 'cors';
import timeout from 'connect-timeout';
import { invalidRoutes } from '#middleware/routes/invalidRoutes';
import { jsonValidation } from '#middleware/body/jsonValidation';
import { requestContextMiddleware } from '#middleware/logger/requestContext';
import { requestTimeOut } from '#middleware/timeout/requestTimeOut';
import { haltOnTimedout } from '#middleware/timeout/haltOnTimedout';
import express, { type Express } from 'express';
import { type Server } from 'http';
import { globalErrorHandler } from '#middleware/global/globalErrorHandler';

export const createApp = (): Express => {
  const app: Express = express();

  /* Middlewares */

  // Disable x-powered-by
  app.disable('x-powered-by');

  // CORS
  app.use(
    cors({
      origin:
        process.env.NODE_ENV !== 'production'
          ? process.env.FRONTEND_URL_LOCALHOST
          : process.env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Request timeout
  app.use(timeout(process.env.REQUEST_TIMEOUT || '15s'));
  app.use(haltOnTimedout);
  app.use(requestTimeOut);

  // Max request body size
  app.use(
    express.json({
      limit: process.env.REQUEST_MAX_BODY_SIZE || '1mb',
      strict: true,
    })
  );

  // JSON validation
  app.use(jsonValidation);

  // Request context logger
  app.use(requestContextMiddleware);

  // Invalid routes
  app.use(invalidRoutes);

  // Global error handler
  app.use(globalErrorHandler);

  return app;
};

export const gracefulShutdown = (server: Server, signal: string) => {
  console.log(`\n🛑 Recieved ${signal}: closing server...`);
  server.close(() => {
    console.log('✅ Server closed correctly.');
    process.exit(0);
  });

  // If server doesn't close after 5s, force exit
  setTimeout(() => {
    console.error('⚠️ Forced server shutdown after 5 seconds.');
    process.exit(1);
  }, 5000).unref();
};
