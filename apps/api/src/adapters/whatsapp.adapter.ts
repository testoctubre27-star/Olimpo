import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { prisma, Prisma } from '../config/database';
import { logger } from '../config/logger';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

// ─── State ────────────────────────────────────
let sock: WASocket | null = null;
let currentQR: string | null = null;
let isConnected = false;
let onMessageCallback: ((phone: string, body: string) => Promise<void>) | null = null;

// Baileys uses file-based auth — we persist to a temp dir then sync to DB
const AUTH_DIR = path.join(process.cwd(), '.baileys-auth');

// ─── DB Auth State ────────────────────────────
// Syncs Baileys file auth to Supabase after each update
async function syncAuthToDB(): Promise<void> {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;

    const files = fs.readdirSync(AUTH_DIR);
    const creds = files.includes('creds.json')
      ? JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf-8'))
      : null;

    // Collect all key files
    const keys: Record<string, unknown> = {};
    for (const file of files) {
      if (file !== 'creds.json' && file.endsWith('.json')) {
        keys[file] = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, file), 'utf-8'));
      }
    }

    if (!creds) return;

    await prisma.whatsAppSession.upsert({
      where: { id: 'main' },
      update: {
        creds: creds as Prisma.InputJsonValue,
        keys: keys as Prisma.InputJsonValue,
      },
      create: {
        id: 'main',
        creds: creds as Prisma.InputJsonValue,
        keys: keys as Prisma.InputJsonValue,
      },
    });

    logger.info('WhatsApp session synced to DB');
  } catch (err) {
    logger.error('Failed to sync WhatsApp session to DB', { err });
  }
}

// Restore auth files from DB to disk so Baileys can read them
async function restoreAuthFromDB(): Promise<boolean> {
  try {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: 'main' } });
    if (!session) return false;

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(AUTH_DIR, 'creds.json'),
      JSON.stringify(session.creds)
    );

    const keys = session.keys as Record<string, unknown>;
    for (const [filename, content] of Object.entries(keys)) {
      fs.writeFileSync(path.join(AUTH_DIR, filename), JSON.stringify(content));
    }

    logger.info('WhatsApp session restored from DB');
    return true;
  } catch (err) {
    logger.error('Failed to restore WhatsApp session from DB', { err });
    return false;
  }
}

// ─── Connect ──────────────────────────────────
export async function connectWhatsApp(
  onMessage: (phone: string, body: string) => Promise<void>
): Promise<void> {
  onMessageCallback = onMessage;

  // Try to restore session from DB first
  await restoreAuthFromDB();
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const pinoLogger = pino({ level: 'silent' }); // Suppress Baileys verbose logs

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
    },
    printQRInTerminal: false, // We handle QR ourselves
    logger: pinoLogger,
    browser: ['OLIMPO', 'Chrome', '120.0'],
    syncFullHistory: false,
  });

  // ── Save creds on update and sync to DB ──────
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await syncAuthToDB();
  });

  // ── Connection events ─────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      isConnected = false;
      logger.info('WhatsApp QR generated — scan at /api/whatsapp/qr');
    }

    if (connection === 'open') {
      currentQR = null;
      isConnected = true;
      logger.info('WhatsApp connected successfully');
      await syncAuthToDB();
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn('WhatsApp disconnected', { statusCode, shouldReconnect });

      if (shouldReconnect) {
        logger.info('Reconnecting WhatsApp in 5s...');
        setTimeout(() => connectWhatsApp(onMessage), 5000);
      } else {
        // Logged out — clear session from DB
        logger.warn('WhatsApp logged out — clearing session from DB');
        await prisma.whatsAppSession.deleteMany({ where: { id: 'main' } });
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true });
        }
      }
    }
  });

  // ── Incoming messages ─────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue; // Ignore our own messages
      if (!msg.message) continue;

      const phone = msg.key.remoteJid?.replace('@s.whatsapp.net', '').replace('+', '') ?? '';
      if (!phone) continue;

      const body =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        '';

      if (!body.trim()) continue;

      logger.info('Message received', { phone, body: body.slice(0, 60) });

      if (onMessageCallback) {
        await onMessageCallback(phone, body).catch(err =>
          logger.error('Error handling message', { err, phone })
        );
      }
    }
  });
}

// ─── Send message ─────────────────────────────
export interface SendMessageOptions {
  to: string;
  body: string;
  studentId?: string;
  type?: string;
}

export const WhatsAppAdapter = {
  async send(opts: SendMessageOptions): Promise<void> {
    if (!sock || !isConnected) {
      logger.warn('WhatsApp not connected — message not sent', { to: opts.to, type: opts.type });
      return;
    }

    const jid = `${opts.to.replace(/\D/g, '')}@s.whatsapp.net`;

    try {
      await sock.sendMessage(jid, { text: opts.body });

      // Log to DB
      await prisma.notificationLog.create({
        data: {
          phone: opts.to,
          studentId: opts.studentId,
          type: opts.type ?? 'GENERAL',
          message: opts.body,
        },
      });

      logger.info('WhatsApp message sent', { to: opts.to, type: opts.type });
    } catch (err) {
      logger.error('WhatsApp send failed', { to: opts.to, err });

      await prisma.notificationLog.create({
        data: {
          phone: opts.to,
          studentId: opts.studentId,
          type: opts.type ?? 'GENERAL',
          message: opts.body,
          error: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => undefined);
    }
  },

  getQR(): string | null {
    return currentQR;
  },

  isConnected(): boolean {
    return isConnected;
  },

  getSocket(): WASocket | null {
    return sock;
  },
};
