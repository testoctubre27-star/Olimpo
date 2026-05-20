import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';

const router = Router();
router.use(authenticate);

// ─── Helper: get teacher record from logged-in user ───
async function getTeacherFromUser(userId: string) {
  return prisma.teacher.findUnique({ where: { userId } });
}

// ─────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────

// GET /teachers — list all teachers (admin only)
router.get('/', requireAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: { select: { name: true, email: true } },
        students: { select: { id: true, name: true, status: true } },
        scheduleSlots: {
          where: { isActive: true },
          include: { schedule: { include: { modality: true } } },
        },
      },
    });
    respond.ok(res, { data: teachers });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────
// TEACHER ROUTES — own data only
// ─────────────────────────────────────────────────────

// GET /teachers/my-students — students assigned to this teacher
router.get('/my-students', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.ok(res, { data: [] }); return; }

    const students = await prisma.student.findMany({
      where: { teacherId: teacher.id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    respond.ok(res, { data: students });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────
// SCHEDULE MANAGEMENT — teachers manage their own schedules
// ─────────────────────────────────────────────────────

const scheduleSchema = z.object({
  dayOfWeek:  z.number().int().min(0).max(6),
  startTime:  z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  endTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  modality:   z.enum([
    'BABY_PHASE1', 'BABY_PHASE2', 'BABY_PHASE3',
    'GROUP_CHILD', 'GROUP_ADULT', 'FREE_ACCESS', 'AQUA_THERAPY', 'PERSONAL_CHILD',
  ]),
  capacity:   z.number().int().min(1).max(50),
});

// GET /teachers/my-schedules — teacher sees their own schedules
router.get('/my-schedules', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.ok(res, { data: [] }); return; }

    const schedules = await prisma.schedule.findMany({
      where: { teacherId: teacher.id },
      include: {
        modality: true,
        slots: {
          where: { isActive: true },
          include: { student: { select: { id: true, name: true, status: true } } },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    respond.ok(res, { data: schedules });
  } catch (err) { next(err); }
});

// POST /teachers/my-schedules — teacher creates a new schedule slot
router.post('/my-schedules', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) {
      respond.error(res, { message: 'Perfil de maestro no encontrado' }, 404);
      return;
    }

    const body = scheduleSchema.parse(req.body);

    // Validate capacity against modality max
    const modalityConfig = await prisma.modalityConfig.findUnique({
      where: { modality: body.modality as never },
    });

    if (modalityConfig && body.capacity > modalityConfig.maxCapacity) {
      respond.error(res, {
        message: `El cupo máximo para ${modalityConfig.name} es ${modalityConfig.maxCapacity} alumnos`,
        code: 'CAPACITY_EXCEEDED',
      }, 422);
      return;
    }

    // Check for time conflict with existing schedules for this teacher
    const conflict = await prisma.schedule.findFirst({
      where: {
        teacherId: teacher.id,
        dayOfWeek: body.dayOfWeek,
        isActive: true,
        OR: [
          { startTime: { lte: body.startTime }, endTime: { gt: body.startTime } },
          { startTime: { lt: body.endTime },   endTime: { gte: body.endTime } },
          { startTime: { gte: body.startTime }, endTime: { lte: body.endTime } },
        ],
      },
    });

    if (conflict) {
      respond.error(res, {
        message: `Ya tienes un horario en ese día y hora (${conflict.startTime}–${conflict.endTime})`,
        code: 'SCHEDULE_CONFLICT',
      }, 409);
      return;
    }

    // Get or create the modality config link
    const schedule = await prisma.schedule.create({
      data: {
        teacherId:  teacher.id,
        modalityId: modalityConfig!.id,
        dayOfWeek:  body.dayOfWeek,
        startTime:  body.startTime,
        endTime:    body.endTime,
        capacity:   body.capacity,
      },
      include: { modality: true, slots: true },
    });

    respond.created(res, { data: schedule, message: 'Horario creado correctamente' });
  } catch (err) { next(err); }
});

// PATCH /teachers/my-schedules/:id — teacher edits capacity
router.patch('/my-schedules/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'No autorizado' }, 403); return; }

    const schedule = await prisma.schedule.findFirst({
      where: { id: req.params.id, teacherId: teacher.id },
      include: { slots: { where: { isActive: true } }, modality: true },
    });

    if (!schedule) { respond.error(res, { message: 'Horario no encontrado' }, 404); return; }

    const { capacity } = z.object({ capacity: z.number().int().min(1).max(50) }).parse(req.body);

    // Cannot reduce below current number of students
    const currentStudents = schedule.slots.length;
    if (capacity < currentStudents) {
      respond.error(res, {
        message: `No puedes reducir el cupo a ${capacity}. Ya tienes ${currentStudents} alumno(s) en este horario.`,
        code: 'CAPACITY_BELOW_ENROLLED',
      }, 422);
      return;
    }

    // Cannot exceed modality max
    if (capacity > schedule.modality.maxCapacity) {
      respond.error(res, {
        message: `El cupo máximo para esta modalidad es ${schedule.modality.maxCapacity}`,
        code: 'CAPACITY_EXCEEDED',
      }, 422);
      return;
    }

    const updated = await prisma.schedule.update({
      where: { id: req.params.id },
      data: { capacity },
      include: { modality: true, slots: { where: { isActive: true }, include: { student: { select: { id: true, name: true } } } } },
    });

    respond.ok(res, { data: updated, message: 'Cupo actualizado' });
  } catch (err) { next(err); }
});

// DELETE /teachers/my-schedules/:id — teacher deletes schedule (only if no students)
router.delete('/my-schedules/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'No autorizado' }, 403); return; }

    const schedule = await prisma.schedule.findFirst({
      where: { id: req.params.id, teacherId: teacher.id },
      include: { slots: { where: { isActive: true } } },
    });

    if (!schedule) { respond.error(res, { message: 'Horario no encontrado' }, 404); return; }

    if (schedule.slots.length > 0) {
      respond.error(res, {
        message: `No puedes eliminar este horario porque tiene ${schedule.slots.length} alumno(s) activo(s). Desactívalo en su lugar.`,
        code: 'SCHEDULE_HAS_STUDENTS',
      }, 409);
      return;
    }

    await prisma.schedule.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    respond.noContent(res);
  } catch (err) { next(err); }
});

export default router;
