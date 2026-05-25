import { Router, Request, Response, NextFunction } from 'express';
import QRCode from 'qrcode';
import { authenticate, requireAdmin } from '../middleware/auth';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';

const router = Router();

// Accepts token via header OR ?token= query param
function authenticateQuery(req: Request, res: Response, next: NextFunction): void {
  const tokenFromQuery = req.query.token as string | undefined;
  if (tokenFromQuery) req.headers.authorization = `Bearer ${tokenFromQuery}`;
  authenticate(req, res, next);
}

// GET /api/whatsapp/status
router.get('/status', authenticate, requireAdmin,
  (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        connected: WhatsAppAdapter.isConnected(),
        hasQR:     WhatsAppAdapter.getQR() !== null,
      },
    });
  }
);

// GET /api/whatsapp/qr?token=JWT
// HTML page with QR code to scan
router.get('/qr', authenticateQuery, requireAdmin,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = _req.query.token as string ?? '';

      if (WhatsAppAdapter.isConnected()) {
        res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLIMPO WhatsApp</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
        height:100vh;margin:0;background:#0F1523;color:white;flex-direction:column;gap:16px}
        a{color:#0057FF}</style></head>
        <body>
          <div style="font-size:48px">✅</div>
          <h2>WhatsApp conectado</h2>
          <p style="color:#6B7280">El bot está activo y listo para recibir mensajes.</p>
          <a href="javascript:location.reload()">Refrescar</a>
        </body></html>`);
        return;
      }

      const qr = WhatsAppAdapter.getQR();

      if (!qr) {
        res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLIMPO WhatsApp</title>
        <meta http-equiv="refresh" content="3;url=/api/whatsapp/qr?token=${token}">
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
        height:100vh;margin:0;background:#0F1523;color:white;flex-direction:column;gap:16px}
        </style></head>
        <body>
          <div style="font-size:48px">⏳</div>
          <h2>Generando QR...</h2>
          <p style="color:#6B7280">Esta página se actualizará automáticamente en unos segundos.</p>
        </body></html>`);
        return;
      }

      const qrImage = await QRCode.toDataURL(qr, {
        width: 320, margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      res.send(`<!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>OLIMPO — Vincular WhatsApp</title>
      <meta http-equiv="refresh" content="30;url=/api/whatsapp/qr?token=${token}">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; background: #0F1523; color: white;
               min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #1a2035; border: 1px solid #2a3555; border-radius: 20px;
                padding: 40px; text-align: center; max-width: 420px; width: 100%; }
        .logo { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
        .sub  { color: #6B7280; font-size: 14px; margin-bottom: 28px; }
        .qr   { background: white; border-radius: 16px; padding: 16px; display: inline-block; margin-bottom: 24px; }
        .qr img { display: block; width: 280px; height: 280px; }
        .steps { text-align: left; display: flex; flex-direction: column; gap: 10px; }
        .step  { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: #9CA3AF; }
        .step span { background: #0057FF; color: white; border-radius: 50%;
                     width: 22px; height: 22px; display: flex; align-items: center;
                     justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .note { color: #6B7280; font-size: 12px; margin-top: 20px; }
        a { color: #0057FF; }
      </style></head>
      <body><div class="card">
        <div class="logo">🏊 OLIMPO</div>
        <div class="sub">Vincular número de WhatsApp</div>
        <div class="qr"><img src="${qrImage}" alt="QR WhatsApp" /></div>
        <div class="steps">
          <div class="step"><span>1</span><p>Abre WhatsApp en tu teléfono</p></div>
          <div class="step"><span>2</span><p>Ve a <strong>Configuración → Dispositivos vinculados</strong></p></div>
          <div class="step"><span>3</span><p>Toca <strong>"Vincular un dispositivo"</strong></p></div>
          <div class="step"><span>4</span><p>Escanea este código QR</p></div>
        </div>
        <div class="note">⏱ El QR se renueva cada 30 segundos · <a href="/api/whatsapp/qr?token=${token}">Refrescar</a></div>
      </div></body></html>`);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
