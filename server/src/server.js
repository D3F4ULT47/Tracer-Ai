import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import {
  initializeInfrastructure,
  shutdownInfrastructure,
} from './infrastructure/initialize-infrastructure.js';
import { logger } from './infrastructure/logging/logger.js';

const app = createApp();
const server = createServer(app);
let isShuttingDown = false;

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Tracer AI API is listening');
  void initializeInfrastructure();
});

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server failed to close cleanly');
      process.exitCode = 1;
    }

    await shutdownInfrastructure();
    logger.info('Graceful shutdown completed');
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
