import { Router } from 'express';

const router = Router();

// Twilio webhook removed — now using Baileys (WhatsApp Web)
// Messages are received directly via Baileys socket connection
// See: src/adapters/whatsapp.adapter.ts

export default router;
