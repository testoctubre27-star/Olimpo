import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { StudentService } from '../services/student.service';
import { respond } from '../utils/response';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

const activateSchema = z.object({
  scheduleId: z.string().cuid(),
  teacherId: z.string().cuid().optional(),
});

router.get('/', requireTeacher, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await StudentService.list({
      status: req.query.status as never,
      search: req.query.search as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return respond.ok(res, { data: result.items, meta: { total: result.total, page: result.page, pages: result.pages } });
  } catch (err) { next(err); }
});

router.get('/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await StudentService.getById(req.params.id);
    return respond.ok(res, { data: student });
  } catch (err) { next(err); }
});

router.post('/:id/activate', requireAdmin, audit('STUDENT_ACTIVATED', 'Student'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scheduleId, teacherId } = activateSchema.parse(req.body);
      const student = await StudentService.activate(req.params.id, scheduleId, teacherId);
      return respond.ok(res, { data: student, message: 'Alumno activado correctamente' });
    } catch (err) { next(err); }
  }
);

router.post('/:id/suspend', requireAdmin, audit('STUDENT_SUSPENDED', 'Student'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await StudentService.suspend(req.params.id);
      return respond.noContent(res);
    } catch (err) { next(err); }
  }
);

export default router;
