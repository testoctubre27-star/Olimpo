import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth';
import { WhatsAppAdapter, requestPairing, connectWhatsApp } from '../adapters/whatsapp.adapter';
import { handleIncomingMessage } from '../adapters/bot.handler';

const router = Router();

// ── Auth middleware que acepta token por query param ──
function authenticateQuery(req: Request, res: Response, next: NextFunction): void {
  const tokenFromQuery = req.query.token as string | undefined;
  if (tokenFromQuery) req.headers.authorization = `Bearer ${tokenFromQuery}`;
  authenticate(req, res, next);
}

// ─────────────────────────────────────────────
// GET /api/whatsapp/status
// ─────────────────────────────────────────────
router.get('/status', authenticate, requireAdmin,
  (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        connected:    WhatsAppAdapter.isConnected(),
        pairingCode:  WhatsAppAdapter.getPairingCode(),
        pairingPhone: WhatsAppAdapter.getPairingPhone(),
      },
    });
  }
);

// ─────────────────────────────────────────────
// POST /api/whatsapp/pair
// Inicia el proceso de emparejamiento con un número
// ─────────────────────────────────────────────
router.post('/pair', authenticate, requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = z.object({
        phone: z.string().min(10, 'Ingresa el número completo con código de país'),
      }).parse(req.body);

      if (WhatsAppAdapter.isConnected()) {
        res.status(409).json({ success: false, message: 'WhatsApp ya está conectado. Desvincula primero.' });
        return;
      }

      // Clear session and set phone for pairing
      await requestPairing(phone);

      // Reconnect so Baileys requests the code
      connectWhatsApp(handleIncomingMessage).catch(err => {
        console.error('[WA] Error iniciando emparejamiento:', err);
      });

      res.json({
        success: true,
        message: 'Proceso de emparejamiento iniciado. El código de 8 dígitos estará disponible en unos segundos.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/whatsapp/pair-status?token=JWT
// Página HTML que muestra el código de emparejamiento
// ─────────────────────────────────────────────
router.get('/pair-status', authenticateQuery, requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const connected    = WhatsAppAdapter.isConnected();
    const pairingCode  = WhatsAppAdapter.getPairingCode();
    const pairingPhone = WhatsAppAdapter.getPairingPhone();
    const token        = req.query.token as string ?? '';

    const style = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; background: #0F1523; color: white;
               min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #1a2035; border: 1px solid #2a3555; border-radius: 20px;
                padding: 40px; text-align: center; max-width: 460px; width: 100%; }
        .logo  { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
        .sub   { color: #6B7280; font-size: 14px; margin-bottom: 28px; }
        .code  { display: flex; gap: 10px; justify-content: center; margin: 24px 0; flex-wrap: wrap; }
        .digit { background: #0057FF; color: white; font-size: 26px; font-weight: 800;
                 width: 52px; height: 60px; border-radius: 12px;
                 display: flex; align-items: center; justify-content: center; letter-spacing: 2px; }
        .steps { text-align: left; display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
        .step  { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: #9CA3AF; }
        .step span { background: #0057FF; color: white; border-radius: 50%;
                     width: 22px; height: 22px; display: flex; align-items: center;
                     justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .note  { color: #6B7280; font-size: 12px; margin-top: 20px; }
        a      { color: #0057FF; font-size: 13px; }
      </style>`;

    if (connected) {
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLIMPO WhatsApp</title>${style}</head>
      <body><div class="card">
        <div class="logo">🏊 OLIMPO</div>
        <div style="font-size:48px;margin:16px 0">✅</div>
        <h2 style="margin-bottom:8px">WhatsApp conectado</h2>
        <p style="color:#6B7280">El bot está activo y listo para recibir mensajes.</p>
        <div class="note" style="margin-top:24px"><a href="javascript:location.reload()">Refrescar estado</a></div>
      </div></body></html>`);
      return;
    }

    if (!pairingPhone) {
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLIMPO WhatsApp</title>${style}</head>
      <body><div class="card">
        <div class="logo">🏊 OLIMPO</div>
        <div class="sub">Vinculación por código de emparejamiento</div>
        <p style="color:#9CA3AF;margin-bottom:20px">No hay proceso de emparejamiento activo.</p>
        <p style="color:#9CA3AF;font-size:13px">Ve al Dashboard y usa el botón <strong>"Vincular WhatsApp"</strong> para iniciar.</p>
        <div class="note" style="margin-top:24px"><a href="javascript:location.reload()">Refrescar</a></div>
      </div></body></html>`);
      return;
    }

    if (!pairingCode) {
      // Waiting for code — auto-refresh every 3 seconds
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLIMPO WhatsApp</title>
      <meta http-equiv="refresh" content="3;url=/api/whatsapp/pair-status?token=${token}">${style}</head>
      <body><div class="card">
        <div class="logo">🏊 OLIMPO</div>
        <div class="sub">Generando código para +${pairingPhone}...</div>
        <div style="font-size:48px;margin:20px 0">⏳</div>
        <p style="color:#9CA3AF">Espera unos segundos, el código se generará automáticamente.</p>
        <div class="note" style="margin-top:24px">Esta página se actualiza sola · <a href="/api/whatsapp/pair-status?token=${token}">Refrescar ahora</a></div>
      </div></body></html>`);
      return;
    }

    // Show pairing code — split into groups of 4 for readability
    const parts = pairingCode.match(/.{1,4}/g) ?? [pairingCode];
    const digits = parts.map(p => `<div class="digit">${p}</div>`).join('');

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLIMPO WhatsApp</title>
    <meta http-equiv="refresh" content="60;url=/api/whatsapp/pair-status?token=${token}">${style}</head>
    <body><div class="card">
      <div class="logo">🏊 OLIMPO</div>
      <div class="sub">Ingresa este código en WhatsApp</div>
      <div class="code">${digits}</div>
      <p style="color:#9CA3AF;font-size:13px;margin-bottom:4px">Número: <strong>+${pairingPhone}</strong></p>
      <div class="steps">
        <div class="step"><span>1</span><p>Abre WhatsApp en el teléfono con el número <strong>+${pairingPhone}</strong></p></div>
        <div class="step"><span>2</span><p>Ve a <strong>Configuración → Dispositivos vinculados</strong></p></div>
        <div class="step"><span>3</span><p>Toca <strong>"Vincular un dispositivo"</strong> → <strong>"Vincular con número de teléfono"</strong></p></div>
        <div class="step"><span>4</span><p>Ingresa el código de 8 dígitos que aparece arriba</p></div>
      </div>
      <div class="note">⏱ El código expira en ~60 segundos · <a href="/api/whatsapp/pair-status?token=${token}">Refrescar</a></div>
    </div></body></html>`);
  }
);

// ─────────────────────────────────────────────
// DELETE /api/whatsapp/disconnect
// Desconecta y limpia la sesión
// ─────────────────────────────────────────────
router.delete('/disconnect', authenticate, requireAdmin,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sock = WhatsAppAdapter.getSocket();
      if (sock) {
        try { await sock.logout(); } catch { /* ignore */ }
      }
      res.json({ success: true, message: 'WhatsApp desconectado' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
