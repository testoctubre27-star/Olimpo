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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let onMessageCallback: ((phone: string, body: string) => Promise<void>) | null = null;

// LID → real phone mapping built up as messages arrive
const lidPhoneMap = new Map<string, string>();

const AUTH_DIR = path.join(process.cwd(), '.baileys-auth');

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

// ─── Resolve phone from JID ───────────────────
// Handles both @s.whatsapp.net and @lid formats
function resolvePhone(jid: string, participant?: string): string | null {
  // Normal JID — extract phone directly
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '');
  }

  // @lid format — check our map first
  if (jid.endsWith('@lid')) {
    // Check if we already resolved this LID
    const cached = lidPhoneMap.get(jid);
    if (cached) return cached;

    // participant field sometimes contains the real JID
    if (participant?.endsWith('@s.whatsapp.net')) {
      const phone = participant.replace('@s.whatsapp.net', '');
      lidPhoneMap.set(jid, phone);
      logger.info(`[WA] LID ${jid} → ${phone} (via participant)`);
      return phone;
    }

    return null; // Cannot resolve yet
  }

  return null;
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

  // ── Learn LID → phone from contact updates ────
  // This is the key: when WhatsApp sends contact info,
  // we learn the real phone behind each LID
  sock.ev.on('contacts.update', (contacts) => {
    for (const contact of contacts) {
      if (contact.id?.endsWith('@s.whatsapp.net') && contact.lid) {
        const phone = contact.id.replace('@s.whatsapp.net', '');
        lidPhoneMap.set(contact.lid, phone);
        logger.info(`[WA] Contacto aprendido: LID ${contact.lid} → ${phone}`);
      }
    }
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const contact of contacts) {
      if (contact.id?.endsWith('@s.whatsapp.net') && contact.lid) {
        const phone = contact.id.replace('@s.whatsapp.net', '');
        lidPhoneMap.set(contact.lid, phone);
        logger.info(`[WA] Contacto upsert: LID ${contact.lid} → ${phone}`);
      }
    }
  });

  // ── Incoming messages ─────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;
      if (!msg.message) continue;

      const rawJid      = msg.key.remoteJid ?? '';
      const participant = msg.key.participant ?? '';

      const phone = resolvePhone(rawJid, participant);

      if (!phone) {
        logger.warn(`[WA] No se pudo resolver JID: ${rawJid} — esperando contacto...`);

        // Request contact info so next message resolves correctly
        if (sock && rawJid) {
          try {
            await sock.updateProfilePicture(rawJid, Buffer.alloc(0)).catch(() => undefined);
          } catch { /* ignore */ }
        }
        continue;
      }

      const body =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        '';

      if (!body.trim()) continue;

      logger.info(`[WA] ✉️  De: ${phone} | Texto: "${body.slice(0, 80)}"`);

      if (onMessageCallback) {
        await onMessageCallback(phone, body).catch(err =>
          logger.error('[WA] Error procesando mensaje', { err, phone })
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
      logger.warn(`[WA] No conectado — mensaje NO enviado a ${opts.to}`);
      return;
    }

    // Always send to @s.whatsapp.net — never to @lid
    const cleanPhone = opts.to.replace(/[^0-9]/g, '');
    const jid        = `${cleanPhone}@s.whatsapp.net`;

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

      logger.info(`[WA] ✅ Enviado a ${cleanPhone} (${opts.type})`);
    } catch (err) {
      logger.error(`[WA] Error enviando a ${cleanPhone}`, { err });
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
