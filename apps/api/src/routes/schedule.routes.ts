// schedule.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { respond } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cached = await cache.get('schedules:all');
    if (cached) return respond.ok(res, { data: cached });

    const schedules = await prisma.schedule.findMany({
      where: { isActive: true },
      include: {
        modality: true,
        slots: {
          where: { isActive: true },
          include: { student: { select: { id: true, name: true, status: true } }, teacher: { include: { user: { select: { name: true } } } } },
        },
        waitingList: { where: { confirmedAt: null, skippedAt: null }, orderBy: { position: 'asc' } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    await cache.set('schedules:all', schedules, cache.TTL.SHORT);
    return respond.ok(res, { data: schedules });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await prisma.schedule.create({
      data: {
        modalityId: req.body.modalityId,
        dayOfWeek: req.body.dayOfWeek,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
      },
    });
    await cache.del('schedules:all');
    return respond.created(res, { data: schedule });
  } catch (err) { next(err); }
});

export default router;
