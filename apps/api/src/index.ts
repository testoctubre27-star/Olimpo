import { app } from './app';
import { config } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { registerAutomations } from './services/automation.service';
import { logger } from './config/logger';

async function bootstrap() {
  // ── Database (required) ───────────────────────
  await prisma.$connect();
  logger.info('Database connected');

  // ── Redis (optional — graceful degradation) ───
  const redisConfigured =
    config.REDIS_URL.startsWith('redis://') ||
    config.REDIS_URL.startsWith('rediss://');

  if (redisConfigured) {
    try {
      await redis.connect();
      // Register cron jobs only when Redis is available
      registerAutomations();
    } catch (err) {
      logger.warn('Redis unavailable — running without cache and automations', { err });
    }
  } else {
    logger.warn('REDIS_URL not configured — running without cache and automations');
  }

  // ── HTTP server ───────────────────────────────
  const server = app.listen(config.PORT, () => {
    logger.info(`OLIMPO API running on port ${config.PORT} [${config.NODE_ENV}]`);
  });

  // ── Graceful shutdown ─────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      try { await redis.quit(); } catch { /* ignore if not connected */ }
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
