import { app } from './app';
import { config } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { registerAutomations } from './services/automation.service';
import { connectWhatsApp } from './adapters/whatsapp.adapter';
import { handleIncomingMessage } from './adapters/bot.handler';
import { logger } from './config/logger';
import https from 'https';
import http from 'http';

// ─── Self-ping to prevent Render Free sleep ───
// Renders free tier sleeps after 15 min of inactivity.
// We ping our own health endpoint every 10 minutes
// so the server never goes idle.
function startKeepAlive(): void {
  const url = config.API_URL;
  if (!url || url.includes('localhost')) {
    logger.info('Keep-alive desactivado en desarrollo');
    return;
  }

  const pingUrl = `${url}/api/health`;
  const client  = pingUrl.startsWith('https') ? https : http;

  setInterval(() => {
    const req = client.get(pingUrl, (res) => {
      logger.info(`[KeepAlive] ping → ${res.statusCode}`);
    });
    req.on('error', (err) => {
      logger.warn(`[KeepAlive] error en ping: ${err.message}`);
    });
    req.end();
  }, 10 * 60 * 1000); // every 10 minutes

  logger.info(`[KeepAlive] Auto-ping activo → ${pingUrl} cada 10 min`);
}

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
      registerAutomations();
    } catch (err) {
      logger.warn('Redis unavailable — running without cache and automations', { err });
    }
  } else {
    logger.warn('REDIS_URL not configured — running without cache and automations');
  }

  // ── WhatsApp (Baileys) — non-blocking ─────────
  connectWhatsApp(handleIncomingMessage).catch(err => {
    logger.error('WhatsApp connection failed', { err });
  });

  // ── HTTP server ───────────────────────────────
  const server = app.listen(config.PORT, () => {
    logger.info(`OLIMPO API running on port ${config.PORT} [${config.NODE_ENV}]`);
    logger.info(`WhatsApp pairing: ${config.API_URL}/api/whatsapp/pair-status`);
  });

  // ── Keep-alive (anti-sleep para Render Free) ──
  startKeepAlive();

  // ── Graceful shutdown ─────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      try { await redis.quit(); } catch { /* ignore */ }
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
