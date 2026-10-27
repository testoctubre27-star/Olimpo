import { ConversationState, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { logger } from '../config/logger';

// ─── Send helper ──────────────────────────────
async function send(phone: string, body: string, type = 'BOT') {
  await WhatsAppAdapter.send({ to: phone, body, type });
}

// ─── Session helpers ──────────────────────────
function stepOf(session: { data: unknown }): string | undefined {
  const data = (session.data ?? {}) as { step?: string };
  return data.step;
}

// ─── Greeting / restart keywords ──────────────
const GREETINGS = new Set([
  'HOLA', 'HOLA!', 'MENU', 'MENÚ', 'INICIO', 'HELLO', 'HI',
  'BUENAS', 'BUENOS DÍAS', 'BUENAS TARDES', 'BUENAS NOCHES',
]);

// ─── Messages ─────────────────────────────────
const SERVICES_MSG = `Gracias por comunicarte con nosotros, estos son nuestros servicios:

• Natación bebés de 5 - 12 meses
• Natación bebés de 1 - 3 años
• Natación bebés de 3 a 5 años
• Natación grupal
• Natación personalizada
• Natación Acceso libre
• Terapia acuatica
• Calistenia

Responde con el servicio que te interesa.`;

const RESPONSE_MSG = `Gracias por tu interés.

En un máximo de 24 horas recibirás respuesta de parte de nuestro equipo.

¡Gracias por comunicarte con OLIMPO!`;

// ─── HANDLER ─────────────────────────────────
// New contact → show services → any response confirms reply within 24h.
// No data is stored and no additional flows run.
export async function handleIncomingMessage(phone: string, body: string): Promise<void> {
  const text = body.trim().toUpperCase();

  let session = await prisma.botSession.findUnique({ where: { phone } });
  if (!session) {
    session = await prisma.botSession.create({
      data: { phone, state: ConversationState.NEW_CONTACT, data: {} },
    });
  }

  logger.info('Bot', { phone, step: stepOf(session) ?? session.state, text: text.slice(0, 60) });

  const step = stepOf(session);
  const isGreeting = GREETINGS.has(text);

  // Show the services menu — new contact, greeting, or a message after the closing response.
  if (isGreeting || step !== 'SERVICES') {
    await prisma.botSession.update({
      where: { phone },
      data: { state: ConversationState.ACTIVE, data: { step: 'SERVICES' } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, SERVICES_MSG, 'SERVICES');
    return;
  }

  // Service selected (or any response) — confirm reply within 24h and end the flow.
  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'DONE' } as unknown as Prisma.InputJsonValue },
  });
  await send(phone, RESPONSE_MSG, 'SERVICE_SELECTED');
}
