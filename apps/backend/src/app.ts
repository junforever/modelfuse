import cors from 'cors';
import timeout from 'connect-timeout';
import express, { type Express } from 'express';

import { invalidRoutes } from '#middleware/routes/invalidRoutes';
import { jsonValidation } from '#middleware/body/jsonValidation';
import { requestContextMiddleware } from '#middleware/logger/requestContext';
import { requestTimeOut } from '#middleware/timeout/requestTimeOut';
import { haltOnTimedout } from '#middleware/timeout/haltOnTimedout';
import { globalErrorHandler } from '#middleware/global/globalErrorHandler';
import { apiRouter } from './routes/apiRouter.js';

export const createApp = (): Express => {
  const app: Express = express();

  app.disable('x-powered-by');

  // The request ID must exist even when body parsing fails.
  app.use(requestContextMiddleware);

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

  app.use(timeout(process.env.REQUEST_TIMEOUT || '15s'));
  app.use(haltOnTimedout);
  app.use(requestTimeOut);

  app.use(
    express.json({
      limit: process.env.REQUEST_MAX_BODY_SIZE || '1mb',
      strict: true,
    })
  );
  app.use(jsonValidation);

  app.use('/api/v1', apiRouter);

  app.use(invalidRoutes);
  app.use(globalErrorHandler);

  return app;
};
