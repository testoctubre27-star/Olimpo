import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default('http://localhost:4000'),

  // Supabase — two URLs required by Prisma (pooler + direct)
  DATABASE_URL: z.string().min(1),
  DIRECT_URL:   z.string().min(1).optional(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Twilio — optional in development so the app boots without credentials
  TWILIO_ACCOUNT_SID:    z.string().default(''),
  TWILIO_AUTH_TOKEN:     z.string().default(''),
  TWILIO_WHATSAPP_FROM:  z.string().default(''),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // First-run setup endpoint guard
  SETUP_TOKEN:  z.string().optional(),
  ALLOW_SETUP:  z.string().optional(), // set to "true" to enable in production
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:\n', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
