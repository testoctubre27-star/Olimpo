import { Request, Response, NextFunction } from 'express';
import { handleIncomingMessage } from '../adapters/bot.handler';
import { logger } from '../config/logger';

export const WebhookController = {
  async whatsapp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const from: string = req.body.From?.replace('whatsapp:+', '') ?? '';
      const body: string = req.body.Body ?? '';

      if (!from) {
        res.status(200).type('text/xml').send('<Response></Response>');
        return;
      }

      logger.info('Webhook received', { from, bodyLength: body.length });

      // Process async — Twilio expects 200 fast
      setImmediate(() => handleIncomingMessage(from, body));

      res.status(200).type('text/xml').send('<Response></Response>');
    } catch (err) {
      next(err);
    }
  },
};
