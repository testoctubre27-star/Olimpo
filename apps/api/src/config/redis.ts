import Redis from 'ioredis';
import Bull from 'bull';
import { config } from './env';
import { logger } from './logger';

// ─── Redis client (cache) ──────────────────────
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { err }));

// ─── Queue factory ────────────────────────────
const QUEUE_OPTIONS: Bull.QueueOptions = {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
};

export const Queues = {
  notifications: new Bull('notifications', QUEUE_OPTIONS),
  automations: new Bull('automations', QUEUE_OPTIONS),
  reports: new Bull('reports', QUEUE_OPTIONS),
} as const;

// ─── Cache helpers ─────────────────────────────
const CACHE_TTL = {
  SHORT: 30,       // seconds — schedule availability
  MEDIUM: 300,     // 5 min — dashboard metrics
  LONG: 3600,      // 1 hour — modality configs
} as const;

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  },

  async set(key: string, value: unknown, ttl = CACHE_TTL.MEDIUM): Promise<void> {
    await redis.setex(key, ttl, JSON.stringify(value));
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  },

  TTL: CACHE_TTL,
};
