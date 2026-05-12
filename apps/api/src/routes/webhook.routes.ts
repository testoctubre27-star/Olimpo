import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

// Twilio posts here on every incoming WhatsApp message
router.post('/whatsapp', WebhookController.whatsapp);

export default router;
