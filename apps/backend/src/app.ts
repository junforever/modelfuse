import cors from 'cors';
import timeout from 'connect-timeout';
import express, { type Express } from 'express';

import { invalidRoutes } from '#middleware/routes/invalidRoutes';
import { jsonValidation } from '#middleware/body/jsonValidation';
import { requestContextMiddleware } from '#middleware/logger/requestContext';
import { requestTimeOut } from '#middleware/timeout/requestTimeOut';
import { haltOnTimedout } from '#middleware/timeout/haltOnTimedout';
import { globalErrorHandler } from '#middleware/global/globalErrorHandler';
import { parseAppEnv, type AppEnvironment } from './infrastructure/config/env.js';
import { createApiRouter, type ApiDependencies } from './routes/apiRouter.js';

export const createApp = (
  dependencies?: ApiDependencies,
  injectedEnvironment?: AppEnvironment
): Express => {
  const app: Express = express();
  const environment = injectedEnvironment ?? parseAppEnv(process.env);
  const frontendOrigin =
    environment.NODE_ENV === 'production'
      ? environment.FRONTEND_URL
      : environment.FRONTEND_URL_LOCALHOST;

  app.disable('x-powered-by');

  // The request ID must exist even when body parsing fails.
  app.use(requestContextMiddleware);

  app.use(
    cors({
      origin: frontendOrigin ?? false,
      credentials: frontendOrigin !== undefined,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  const timeoutMiddleware = timeout(environment.REQUEST_TIMEOUT);
  app.use((request, response, next) =>
    request.path.endsWith('/events') ? next() : timeoutMiddleware(request, response, next)
  );
  app.use(haltOnTimedout);
  app.use(requestTimeOut);

  app.use(
    express.json({
      limit: environment.REQUEST_MAX_BODY_SIZE,
      strict: true,
    })
  );
  app.use(jsonValidation);

  app.use('/api/v1', createApiRouter(dependencies));

  app.use(invalidRoutes);
  app.use(globalErrorHandler);

  return app;
};
