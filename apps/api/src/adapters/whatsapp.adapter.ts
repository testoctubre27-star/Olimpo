import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
  proto,
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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let onMessageCallback: ((phone: string, body: string) => Promise<void>) | null = null;

// Simple message store so getMessage works on retries
const msgStore = new Map<string, proto.IMessage>();

const AUTH_DIR = path.join(process.cwd(), '.baileys-auth');

// ─── Phone helpers ────────────────────────────
/**
 * Convert a JID to a stable session identifier.
 * - @s.whatsapp.net → phone number with country code
 * - @lid            → "lid_XXXX" (WhatsApp internal ID — number is private)
 * Returns null if the JID is a group or unrecognizable.
 */
function jidToSessionPhone(jid: string): string | null {
  if (!jid) return null;
  if (jid.endsWith('@g.us')) return null;
  if (jid === 'status@broadcast') return null;

  if (jid.includes('@lid')) {
    // Use lid_ prefix as stable identifier — number is intentionally hidden
    return 'lid_' + jid.split('@')[0];
  }

  if (jid.endsWith('@s.whatsapp.net')) {
    let raw = jid.split('@')[0].split(':')[0];
    // Fix Mexican numbers: 521XXXXXXXXXX (13 digits) → 52XXXXXXXXXX (12 digits)
    if (raw.startsWith('521') && raw.length === 13) {
      raw = '52' + raw.slice(3);
    }
    return raw;
  }

  return null;
}

/**
 * Convert a phone/lid identifier back to a JID for sending.
 * If it starts with "lid_", use the original @lid JID directly.
 * Otherwise build @s.whatsapp.net JID.
 */
function sessionPhoneToJid(phone: string, originalJid?: string): string {
  // @lid user — reply to the original JID directly (this is the key fix)
  if (phone.startsWith('lid_') && originalJid) {
    return originalJid;
  }

  // Normal phone — fix Mexican numbers then build JID
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length === 13) {
    digits = '52' + digits.slice(3);
  }
  return `${digits}@s.whatsapp.net`;
}

// ─── DB Auth State ────────────────────────────
async function syncAuthToDB(): Promise<void> {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const files = fs.readdirSync(AUTH_DIR);

    const creds = files.includes('creds.json')
      ? JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf-8'))
      : null;

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
        keys:  keys  as Prisma.InputJsonValue,
      },
      create: {
        id:    'main',
        creds: creds as Prisma.InputJsonValue,
        keys:  keys  as Prisma.InputJsonValue,
      },
    });
    logger.info('[WA] Sesión sincronizada a DB');
  } catch (err) {
    logger.error('[WA] Error al sincronizar sesión', { err });
  }
}

async function restoreAuthFromDB(): Promise<boolean> {
  try {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: 'main' } });
    if (!session) return false;

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(path.join(AUTH_DIR, 'creds.json'), JSON.stringify(session.creds));

    const keys = session.keys as Record<string, unknown>;
    for (const [filename, content] of Object.entries(keys)) {
      fs.writeFileSync(path.join(AUTH_DIR, filename), JSON.stringify(content));
    }

    logger.info('[WA] Sesión restaurada desde DB');
    return true;
  } catch (err) {
    logger.error('[WA] Error al restaurar sesión', { err });
    return false;
  }
}

// ─── Connect ──────────────────────────────────
export async function connectWhatsApp(
  onMessage: (phone: string, body: string) => Promise<void>
): Promise<void> {
  onMessageCallback = onMessage;

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  logger.info('[WA] Iniciando conexión...');

  await restoreAuthFromDB();
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version }          = await fetchLatestBaileysVersion();

  logger.info(`[WA] Versión Baileys: ${version.join('.')}`);

  const pinoLogger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pinoLogger),
    },
    printQRInTerminal: false,
    logger: pinoLogger,
    browser: ['OLIMPO', 'Chrome', '120.0'],
    syncFullHistory: false,
    keepAliveIntervalMs: 15_000,
    // Provide stored messages for retry handling
    getMessage: async (key) => {
      const stored = msgStore.get(key.id ?? '');
      return stored ?? { conversation: '' };
    },
  });

  // ── Creds update ─────────────────────────────
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await syncAuthToDB();
  });

  // ── Connection events ─────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR   = qr;
      isConnected = false;
      logger.info('[WA] QR generado — escanea en /api/whatsapp/qr');
    }

    if (connection === 'open') {
      currentQR   = null;
      isConnected = true;
      logger.info('[WA] ✅ Conectado exitosamente');
      await syncAuthToDB();
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode      = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`[WA] Desconectado (código: ${statusCode}) — reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        logger.info('[WA] Reconectando en 5 segundos...');
        reconnectTimer = setTimeout(() => connectWhatsApp(onMessage), 5000);
      } else {
        logger.warn('[WA] Sesión cerrada — limpiando DB');
        await prisma.whatsAppSession.deleteMany({ where: { id: 'main' } });
        if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true });
      }
    }
  });

  // ── Incoming messages ─────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    logger.info(`[WA] messages.upsert type=${type} count=${messages.length}`);
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid ?? '';

      if (remoteJid.endsWith('@g.us')) continue;
      if (remoteJid === 'status@broadcast') continue;
      if (!msg.message) continue;

      // Cache message for retry handling
      if (msg.key.id && msg.message) {
        msgStore.set(msg.key.id, msg.message);
        if (msgStore.size > 200) {
          const oldest = msgStore.keys().next().value;
          if (oldest) msgStore.delete(oldest);
        }
      }

      // Get stable session identifier
      const sessionPhone = jidToSessionPhone(remoteJid);
      if (!sessionPhone) {
        logger.warn(`[WA] JID no reconocido: ${remoteJid}`);
        continue;
      }

      // Extract text content
      const body = (
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        ''
      ).trim();

      if (!body) {
        logger.info(`[WA] Mensaje sin texto ignorado (${remoteJid})`);
        continue;
      }

      const pushName = msg.pushName ?? '';
      logger.info(`[WA] ✉️  De: ${sessionPhone} (${pushName}) | "${body.slice(0, 80)}"`);

      // Store original JID so we can reply correctly (especially for @lid)
      // We pass the original remoteJid as part of the phone key so the handler
      // can use it when calling WhatsAppAdapter.send()
      // Convention: for @lid users, sessionPhone = "lid_XXXX"
      // The send() method receives this and looks up the original JID

      // Store mapping lid → original jid for reply
      if (remoteJid.includes('@lid')) {
        lidJidMap.set(sessionPhone, remoteJid);
      }

      if (onMessageCallback) {
        await onMessageCallback(sessionPhone, body).catch(err =>
          logger.error('[WA] Error procesando mensaje', { err, sessionPhone })
        );
      }
    }
  });
}

// Map to store lid_XXX → original @lid JID for replies
const lidJidMap = new Map<string, string>();

// ─── Send message ─────────────────────────────
export interface SendMessageOptions {
  to: string;       // sessionPhone (phone number or "lid_XXX")
  body: string;
  studentId?: string;
  type?: string;
}

export const WhatsAppAdapter = {
  async send(opts: SendMessageOptions): Promise<void> {
    if (!sock || !isConnected) {
      logger.warn(`[WA] No conectado — mensaje NO enviado a ${opts.to}`);
      return;
    }

    // Resolve the correct JID to send to
    const originalLidJid = lidJidMap.get(opts.to);
    const jid = sessionPhoneToJid(opts.to, originalLidJid);

    logger.info(`[WA] Enviando a ${opts.to} → jid=${jid}`);

    try {
      await sock.sendMessage(jid, { text: opts.body });

      await prisma.notificationLog.create({
        data: {
          phone:     opts.to,
          studentId: opts.studentId,
          type:      opts.type ?? 'GENERAL',
          message:   opts.body,
        },
      });

      logger.info(`[WA] ✅ Enviado a ${jid} (${opts.type})`);
    } catch (err) {
      logger.error(`[WA] Error enviando a ${jid}`, { err });
      await prisma.notificationLog.create({
        data: {
          phone:     opts.to,
          studentId: opts.studentId,
          type:      opts.type ?? 'GENERAL',
          message:   opts.body,
          error:     err instanceof Error ? err.message : String(err),
        },
      }).catch(() => undefined);
    }
  },

  getQR():       string | null  { return currentQR; },
  isConnected(): boolean        { return isConnected; },
  getSocket():   WASocket | null { return sock; },
};
