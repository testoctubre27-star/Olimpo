import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireAdmin);

// ─── Schemas ──────────────────────────────────
const updateModalitySchema = z.object({
  name:        z.string().min(2).optional(),
  description: z.string().optional(),
  monthlyFee:  z.number().positive().optional(),
  maxCapacity: z.number().int().min(1).optional(),
  isActive:    z.boolean().optional(),
});

const createServiceSchema = z.object({
  name:        z.string().min(2),
  description: z.string().optional(),
  monthlyFee:  z.number().positive(),
  maxCapacity: z.number().int().min(1),
  icon:        z.string().optional(),
});

// ─────────────────────────────────────────────
// MODALITY CONFIGS (enum-based, editable only)
// ─────────────────────────────────────────────

// GET /modalities — all modality configs + free services
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [modalities, services] = await Promise.all([
      prisma.modalityConfig.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { schedules: { where: { isActive: true } } } } },
      }),
      prisma.service.findMany({ orderBy: { name: 'asc' } }),
    ]);

    respond.ok(res, { data: { modalities, services } });
  } catch (err) { next(err); }
});

// PATCH /modalities/:id — edit modality config
router.patch('/:id', audit('MODALITY_UPDATED', 'ModalityConfig'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = updateModalitySchema.parse(req.body);
      const existing = await prisma.modalityConfig.findUnique({ where: { id: req.params.id } });
      if (!existing) { respond.error(res, { message: 'Servicio no encontrado' }, 404); return; }

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

// ─────────────────────────────────────────────
// FREE SERVICES (fully custom, add/edit/delete)
// ─────────────────────────────────────────────

// POST /modalities/services — create new service
router.post('/services', audit('SERVICE_CREATED', 'Service'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createServiceSchema.parse(req.body);
      const service = await prisma.service.create({ data: body });
      respond.created(res, { data: service, message: 'Servicio creado correctamente' });
    } catch (err) { next(err); }
  }
);

// PATCH /modalities/services/:id — update free service
router.patch('/services/:id', audit('SERVICE_UPDATED', 'Service'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createServiceSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
      const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
      if (!existing) { respond.error(res, { message: 'Servicio no encontrado' }, 404); return; }

      const updated = await prisma.service.update({ where: { id: req.params.id }, data: body });
      respond.ok(res, { data: updated, message: 'Servicio actualizado' });
    } catch (err) { next(err); }
  }
);

// DELETE /modalities/services/:id — delete free service
router.delete('/services/:id', audit('SERVICE_DELETED', 'Service'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await prisma.service.delete({ where: { id: req.params.id } });
      respond.noContent(res);
    } catch (err) { next(err); }
  }
);

export default router;
