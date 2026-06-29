import { API_PREFIX } from '@tracer-ai/shared';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { requestContext } from './middlewares/request-context.js';
import { authRouter } from './modules/auth/index.js';
import { userRouter } from './modules/users/index.js';
import { healthRouter } from './shared/health.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.id,
      customLogLevel: (_request, response, error) => {
        if (error || response.statusCode >= 500) return 'error';
        if (response.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(API_PREFIX, authRouter);
  app.use(API_PREFIX, userRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
