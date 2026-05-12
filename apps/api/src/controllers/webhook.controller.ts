import { Request, Response, NextFunction } from 'express';
import { handleIncomingMessage } from '../adapters/bot.handler';
import { respond } from '../utils/response';
import { logger } from '../config/logger';

export const WebhookController = {
  async whatsapp(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, body } = {
        from: req.body.From?.replace('whatsapp:+', '') ?? '',
        body: req.body.Body ?? '',
      };

      if (!from) {
        return respond.ok(res, { data: null, message: 'No sender' });
      }

      logger.info('Webhook received', { from, bodyLength: body.length });

      // Process async — Twilio expects 200 fast
      setImmediate(() => handleIncomingMessage(from, body));

      // Twilio expects TwiML or empty 200
      res.status(200).type('text/xml').send('<Response></Response>');
    } catch (err) {
      next(err);
    }
  },
};
