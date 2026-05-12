import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { respond } from '../utils/response';
import { ConflictError } from '../utils/errors';

const router = Router();

const setupSchema = z.object({
  name:     z.string().min(2,  'Nombre requerido (mínimo 2 caracteres)'),
  email:    z.string().email('Email inválido'),
  password: z.string().min(8,  'La contraseña debe tener al menos 8 caracteres'),
  // Simple guard token so this endpoint isn't completely open
  setupToken: z.string().min(1, 'Setup token requerido'),
});

/**
 * POST /api/setup
 *
 * Creates the first ADMIN user in the database.
 * Permanently disabled once any admin exists — returns 409 from that point on.
 * Requires a SETUP_TOKEN env var as a basic guard against accidental invocation
 * in production.
 *
 * Delete or comment out this route after first use.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  // Block in production unless ALLOW_SETUP=true is explicitly set
  if (config.NODE_ENV === 'production' && process.env.ALLOW_SETUP !== 'true') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  try {
    const { name, email, password, setupToken } = setupSchema.parse(req.body);

    // Validate setup token
    const expectedToken = process.env.SETUP_TOKEN;
    if (!expectedToken || setupToken !== expectedToken) {
      return res.status(403).json({ success: false, message: 'Token de configuración inválido' });
    }

    // Check if any admin already exists — if so, this endpoint is permanently closed
    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin) {
      throw new ConflictError(
        'Ya existe un administrador en el sistema. Este endpoint está deshabilitado. ' +
        'Para crear más usuarios, usa el panel administrativo.'
      );
    }

    // Create the first admin
    const hashed = await bcrypt.hash(password, 12);
    const admin = await prisma.user.create({
      data: { name, email, password: hashed, role: 'ADMIN' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return respond.created(res, {
      data: admin,
      message:
        '✅ Administrador creado correctamente. ' +
        'Este endpoint ya no está disponible. Puedes removerlo de las rutas en producción.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
