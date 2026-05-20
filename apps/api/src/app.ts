import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();

// ─── Trust proxy (required for Render / reverse proxies) ──
// Tells Express to trust the X-Forwarded-For header from the
// first proxy hop — needed for rate limiting and IP detection.
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ─── Rate limiting ────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.',
}));

// ─── Body parsing ─────────────────────────────
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
  skip: (req: express.Request) => req.path === '/api/health',
}));

// ─── Routes ───────────────────────────────────
app.use('/api', routes);

// ─── 404 ──────────────────────────────────────
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// ─── Error handler (must be last) ─────────────
app.use(errorHandler);

export { app };
