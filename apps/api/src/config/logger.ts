import winston from 'winston';
import { config } from './env';

const { combine, timestamp, errors, printf, colorize } = winston.format;

// Simple readable format for Render logs
const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const extra = Object.keys(meta).length && meta.service === undefined
    ? ' ' + JSON.stringify(meta)
    : '';
  return `${ts} [${level.toUpperCase()}] ${message}${extra}`;
});

const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  defaultMeta: { service: 'olimpo-api' },
  transports: [
    // Always log to stdout — Render captures this
    new winston.transports.Console({
      format: combine(
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        config.NODE_ENV === 'development'
          ? combine(colorize(), consoleFormat)
          : combine(timestamp({ format: 'HH:mm:ss' }), consoleFormat)
      ),
    }),
  ],
});

export { logger };
