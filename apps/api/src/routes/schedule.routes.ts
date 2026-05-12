import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { respond } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cached = await cache.get<unknown>('schedules:all');
    if (cached) {
      respond.ok(res, { data: cached });
      return;
    }

    const schedules = await prisma.schedule.findMany({
      where: { isActive: true },
      include: {
        modality: true,
        slots: {
          where: { isActive: true },
          include: {
            student: { select: { id: true, name: true, status: true } },
            teacher: { include: { user: { select: { name: true } } } },
          },
        },
        waitingList: {
          where: { confirmedAt: null, skippedAt: null },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    await cache.set('schedules:all', schedules, 30);
    respond.ok(res, { data: schedules });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schedule = await prisma.schedule.create({
      data: {
        modalityId: req.body.modalityId as string,
        dayOfWeek: req.body.dayOfWeek as number,
        startTime: req.body.startTime as string,
        endTime: req.body.endTime as string,
      },
    });
    await cache.del('schedules:all');
    respond.created(res, { data: schedule });
  } catch (err) { next(err); }
});

export default router;
