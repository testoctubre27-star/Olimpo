import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', requireAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: { select: { name: true, email: true } },
        students: { select: { id: true, name: true, status: true } },
      },
    });
    respond.ok(res, { data: teachers });
  } catch (err) { next(err); }
});

router.get('/my-students', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId: req.user!.sub } });
    if (!teacher) {
      respond.ok(res, { data: [] });
      return;
    }
    const students = await prisma.student.findMany({
      where: { teacherId: teacher.id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    respond.ok(res, { data: students });
  } catch (err) { next(err); }
});

export default router;
