import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { respond } from '../utils/response';
import { ConflictError } from '../utils/errors';

const router = Router();

const setupSchema = z.object({
  name:       z.string().min(2),
  email:      z.string().email(),
  password:   z.string().min(8),
  setupToken: z.string().min(1),
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (config.NODE_ENV === 'production' && process.env.ALLOW_SETUP !== 'true') {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  try {
    const { name, email, password, setupToken } = setupSchema.parse(req.body);

    const expectedToken = process.env.SETUP_TOKEN;
    if (!expectedToken || setupToken !== expectedToken) {
      res.status(403).json({ success: false, message: 'Token inválido' });
      return;
    }

    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin) {
      throw new ConflictError('Ya existe un administrador. Este endpoint está deshabilitado.');
    }

    const hashed = await bcrypt.hash(password, 12);
    const admin = await prisma.user.create({
      data: { name, email, password: hashed, role: 'ADMIN' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    respond.created(res, {
      data: admin,
      message: '✅ Administrador creado. Este endpoint ya no está disponible.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
