import { app } from './app';
import { config } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { registerAutomations } from './services/automation.service';
import { logger } from './config/logger';

async function bootstrap() {
  // Test DB connection
  await prisma.$connect();
  logger.info('Database connected');

  // Connect Redis
  await redis.connect();

  // Register all cron jobs
  registerAutomations();

  // Start HTTP server
  const server = app.listen(config.PORT, () => {
    logger.info(`OLIMPO API running on port ${config.PORT} [${config.NODE_ENV}]`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      await redis.quit();
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
