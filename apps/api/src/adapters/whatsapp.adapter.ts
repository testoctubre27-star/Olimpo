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
let isConnected = false;
let pairingCode: string | null = null;         // 8-digit pairing code
let pairingPhone: string | null = null;        // Phone number being paired
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let onMessageCallback: ((phone: string, body: string) => Promise<void>) | null = null;

// Simple message store so getMessage works on retries
const msgStore = new Map<string, proto.IMessage>();

// LID → original @lid JID map (for reply routing)
const lidJidMap = new Map<string, string>();

const AUTH_DIR = path.join(process.cwd(), '.baileys-auth');

// ─── Phone helpers ────────────────────────────
function jidToSessionPhone(jid: string): string | null {
  if (!jid) return null;
  if (jid.endsWith('@g.us')) return null;
  if (jid === 'status@broadcast') return null;

  if (jid.includes('@lid')) {
    return 'lid_' + jid.split('@')[0];
  }

  if (jid.endsWith('@s.whatsapp.net')) {
    let raw = jid.split('@')[0].split(':')[0];
    if (raw.startsWith('521') && raw.length === 13) {
      raw = '52' + raw.slice(3);
    }
    return raw;
  }

  return null;
}

function sessionPhoneToJid(phone: string, originalJid?: string): string {
  if (phone.startsWith('lid_') && originalJid) return originalJid;
  let digits = phone.replace(/[^0-9]/g, '');
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
    // Use pairing code mode (more stable than QR / WhatsApp Web)
    printQRInTerminal: false,
    logger: pinoLogger,
    browser: ['OLIMPO', 'Chrome', '120.0'],
    syncFullHistory: false,
    keepAliveIntervalMs: 15_000,
    getMessage: async (key) => {
      const stored = msgStore.get(key.id ?? '');
      return stored ?? { conversation: '' };
    },
  });

  // ── Request pairing code if not registered ────
  // This runs only when there is no existing session
  const isRegistered = !!state.creds.registered;
  if (!isRegistered && pairingPhone) {
    // Give socket a moment to initialize before requesting code
    setTimeout(async () => {
      try {
        const phone = pairingPhone!.replace(/[^0-9]/g, '');
        logger.info(`[WA] Solicitando código de emparejamiento para +${phone}`);
        const code = await sock!.requestPairingCode(phone);
        pairingCode = code ?? null;
        logger.info(`[WA] Código de emparejamiento generado: ${pairingCode}`);
      } catch (err) {
        logger.error('[WA] Error al solicitar código de emparejamiento', { err });
        pairingCode = null;
      }
    }, 3000);
  }

  // ── Creds update ─────────────────────────────
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await syncAuthToDB();
  });

  // ── Connection events ─────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      isConnected = true;
      pairingCode  = null; // Clear code once connected
      pairingPhone = null;
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
        pairingCode  = null;
        pairingPhone = null;
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

      const sessionPhone = jidToSessionPhone(remoteJid);
      if (!sessionPhone) {
        logger.warn(`[WA] JID no reconocido: ${remoteJid}`);
        continue;
      }

      const body = (
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        ''
      ).trim();

      if (!body) continue;

      if (remoteJid.includes('@lid')) {
        lidJidMap.set(sessionPhone, remoteJid);
      }

      const pushName = msg.pushName ?? '';
      logger.info(`[WA] ✉️  De: ${sessionPhone} (${pushName}) | "${body.slice(0, 80)}"`);

      if (onMessageCallback) {
        await onMessageCallback(sessionPhone, body).catch(err =>
          logger.error('[WA] Error procesando mensaje', { err, sessionPhone })
        );
      }
    }
  });
}

// ─── Public methods ───────────────────────────

/**
 * Initiate pairing with a phone number.
 * Call this before connectWhatsApp if no session exists.
 */
export async function requestPairing(phone: string): Promise<void> {
  pairingPhone = phone.replace(/[^0-9]/g, '');
  pairingCode  = null;

  // Clear existing session so Baileys requests a new pairing
  await prisma.whatsAppSession.deleteMany({ where: { id: 'main' } });
  if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true });

  logger.info(`[WA] Iniciando emparejamiento para +${pairingPhone}`);
}

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

    const originalLidJid = lidJidMap.get(opts.to);
    const jid = sessionPhoneToJid(opts.to, originalLidJid);

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

  isConnected():    boolean        { return isConnected; },
  getPairingCode(): string | null  { return pairingCode; },
  getPairingPhone(): string | null { return pairingPhone; },
  getSocket():      WASocket | null { return sock; },

  // Legacy QR — kept for backward compat, always null now
  getQR():          string | null  { return null; },
};
