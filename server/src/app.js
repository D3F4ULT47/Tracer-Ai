import { API_PREFIX } from '@tracer-ai/shared';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { requestContext } from './middlewares/request-context.js';
import { authRouter } from './modules/auth/index.js';
import { activityRouter } from './modules/activity/index.js';
import { aiRouter } from './modules/ai/index.js';
import { communityRouter } from './modules/community/index.js';
import { roadmapRouter } from './modules/roadmaps/index.js';
import { userRouter } from './modules/users/index.js';
import { healthRouter } from './shared/health.routes.js';

const clientBuildDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

function serveProductionClient(app) {
  if (env.NODE_ENV !== 'production') return;

  app.use(
    express.static(clientBuildDirectory, {
      index: false,
      maxAge: '1h',
    }),
  );
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith(API_PREFIX)) {
      next();
      return;
    }

    response.setHeader('Cache-Control', 'no-store');
    response.sendFile(resolve(clientBuildDirectory, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
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
  app.use(API_PREFIX, activityRouter);
  app.use(API_PREFIX, communityRouter);
  app.use(API_PREFIX, userRouter);
  app.use(API_PREFIX, aiRouter);
  app.use(API_PREFIX, roadmapRouter);

  serveProductionClient(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
