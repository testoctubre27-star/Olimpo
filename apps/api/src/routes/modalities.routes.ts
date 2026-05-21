import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireAdmin);

const updateSchema = z.object({
  name:        z.string().min(2).optional(),
  description: z.string().optional(),
  monthlyFee:  z.number().positive().optional(),
  maxCapacity: z.number().int().min(1).optional(),
  isActive:    z.boolean().optional(),
});

// GET /modalities — list all
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const modalities = await prisma.modalityConfig.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            schedules: { where: { isActive: true } },
          },
        },
      },
    });
    respond.ok(res, { data: modalities });
  } catch (err) { next(err); }
});

// PATCH /modalities/:id — update name, description, price, capacity, active
router.patch('/:id', audit('MODALITY_UPDATED', 'ModalityConfig'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = updateSchema.parse(req.body);

      const existing = await prisma.modalityConfig.findUnique({ where: { id: req.params.id } });
      if (!existing) { respond.error(res, { message: 'Modalidad no encontrada' }, 404); return; }

      const updated = await prisma.modalityConfig.update({
        where: { id: req.params.id },
        data: {
          ...(body.name        !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.monthlyFee  !== undefined && { monthlyFee: body.monthlyFee }),
          ...(body.maxCapacity !== undefined && { maxCapacity: body.maxCapacity }),
          ...(body.isActive    !== undefined && { isActive: body.isActive }),
        },
      });

      respond.ok(res, { data: updated, message: 'Servicio actualizado correctamente' });
    } catch (err) { next(err); }
  }
);

export default router;
