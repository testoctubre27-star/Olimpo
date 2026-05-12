// teacher.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';

const router = Router();
router.use(authenticate);

// Teachers see their own students; admins see all
router.get('/', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: { user: { select: { name: true, email: true } }, students: { select: { id: true, name: true, status: true } } },
    });
    return respond.ok(res, { data: teachers });
  } catch (err) { next(err); }
});

router.get('/my-students', requireTeacher, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId: req.user!.sub } });
    if (!teacher) return respond.ok(res, { data: [] });

    const students = await prisma.student.findMany({
      where: { teacherId: teacher.id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return respond.ok(res, { data: students });
  } catch (err) { next(err); }
});

export default router;
