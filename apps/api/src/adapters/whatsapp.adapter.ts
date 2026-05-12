import twilio from 'twilio';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/database';

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

// Normalize phone to WhatsApp format
function toWhatsApp(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `whatsapp:+${clean}`;
}

export interface SendMessageOptions {
  to: string;          // raw phone number
  body: string;
  studentId?: string;
  type?: string;       // for notification log
}

export const WhatsAppAdapter = {
  async send(opts: SendMessageOptions): Promise<string | null> {
    const to = toWhatsApp(opts.to);

    try {
      const msg = await client.messages.create({
        from: config.TWILIO_WHATSAPP_FROM,
        to,
        body: opts.body,
      });

      // Log every outbound message
      await prisma.notificationLog.create({
        data: {
          phone: opts.to,
          studentId: opts.studentId,
          type: opts.type ?? 'GENERAL',
          message: opts.body,
          twilioSid: msg.sid,
        },
      });

      logger.info('WhatsApp message sent', { to, sid: msg.sid, type: opts.type });
      return msg.sid;

    } catch (err) {
      logger.error('WhatsApp send failed', { to, err });

      // Log failure too
      await prisma.notificationLog.create({
        data: {
          phone: opts.to,
          studentId: opts.studentId,
          type: opts.type ?? 'GENERAL',
          message: opts.body,
          error: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => { /* ignore secondary failure */ });

      return null;
    }
  },

  // Parse incoming Twilio webhook body
  parseIncoming(body: Record<string, string>) {
    return {
      from: body.From?.replace('whatsapp:', '').replace('+', '') ?? '',
      body: (body.Body ?? '').trim(),
      sid: body.MessageSid ?? '',
    };
  },
};
