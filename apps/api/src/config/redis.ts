import Redis from 'ioredis';
import Bull from 'bull';
import { config } from './env';
import { logger } from './logger';

// ─── Detect if Redis is properly configured ────
const hasRedis = config.REDIS_URL.startsWith('redis://') || config.REDIS_URL.startsWith('rediss://');

// ─── Redis client (cache) ──────────────────────
export const redis = new Redis(hasRedis ? config.REDIS_URL : 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null, // Don't retry — fail fast so we can handle gracefully
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err: NodeJS.ErrnoException) => {
  if (hasRedis) {
    logger.error('Redis error', { err });
  }
  // Silently ignore if no Redis configured — degraded mode
});

// ─── Queue factory ────────────────────────────
const QUEUE_OPTIONS: Bull.QueueOptions = {
  redis: hasRedis ? config.REDIS_URL : 'redis://127.0.0.1:6379',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
  settings: {
    // Don't throw if Redis is unavailable
    drainDelay: 300,
  },
};

export const Queues = hasRedis ? {
  notifications: new Bull('notifications', QUEUE_OPTIONS),
  automations:   new Bull('automations', QUEUE_OPTIONS),
  reports:       new Bull('reports', QUEUE_OPTIONS),
} : null;

// ─── Cache helpers ─────────────────────────────
const CACHE_TTL = {
  SHORT:  30,
  MEDIUM: 300,
  LONG:   3600,
} as const;

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!hasRedis) return null;
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttl: number = CACHE_TTL.MEDIUM): Promise<void> {
    if (!hasRedis) return;
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch {
      // Ignore cache errors — degraded mode
    }
  },

  async del(key: string): Promise<void> {
    if (!hasRedis) return;
    try { await redis.del(key); } catch { /* ignore */ }
  },

  async delPattern(pattern: string): Promise<void> {
    if (!hasRedis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    } catch { /* ignore */ }
  },

  TTL: CACHE_TTL,
};
