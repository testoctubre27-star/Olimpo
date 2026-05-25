import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

async function getTeacherFromUser(userId: string) {
  return prisma.teacher.findUnique({ where: { userId } });
}

// ─────────────────────────────────────────────
// ADMIN — gestión de maestros
// ─────────────────────────────────────────────

const createTeacherSchema = z.object({
  name:          z.string().min(2),
  email:         z.string().email(),
  password:      z.string().min(6),
  phone:         z.string().min(10),
  commissionPct: z.number().min(0).max(100).default(40),
});

router.get('/', requireAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: { select: { name: true, email: true, isActive: true } },
        students: { select: { id: true } },
        schedules: {
          where: { isActive: true },
          include: { modality: true, slots: { where: { isActive: true } } },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });
    respond.ok(res, { data: teachers });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = createTeacherSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      respond.error(res, { message: 'Ya existe un usuario con ese email', code: 'DUPLICATE' }, 409);
      return;
    }
    const hashed = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, password: hashed, role: 'TEACHER', phone: body.phone },
    });
    const teacher = await prisma.teacher.create({
      data: { userId: user.id, displayName: body.name, phone: body.phone, commissionPct: body.commissionPct },
      include: { user: { select: { name: true, email: true, isActive: true } }, students: { select: { id: true } }, schedules: true },
    });
    respond.created(res, { data: teacher, message: 'Maestro creado correctamente' });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      name: z.string().min(2).optional(),
      phone: z.string().min(10).optional(),
      commissionPct: z.number().min(0).max(100).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const teacher = await prisma.teacher.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!teacher) { respond.error(res, { message: 'Maestro no encontrado' }, 404); return; }

    await prisma.teacher.update({
      where: { id: req.params.id },
      data: {
        ...(body.name          && { displayName: body.name }),
        ...(body.phone         && { phone: body.phone }),
        ...(body.commissionPct !== undefined && { commissionPct: body.commissionPct }),
      },
    });
    await prisma.user.update({
      where: { id: teacher.userId },
      data: {
        ...(body.name     && { name: body.name }),
        ...(body.phone    && { phone: body.phone }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    const updated = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { name: true, email: true, isActive: true } }, students: { select: { id: true } }, schedules: { where: { isActive: true } } },
    });
    respond.ok(res, { data: updated, message: 'Maestro actualizado' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// TEACHER — sus propios datos
// ─────────────────────────────────────────────

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

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/),
  modality:  z.enum(['BABY_PHASE1','BABY_PHASE2','BABY_PHASE3','GROUP_CHILD','GROUP_ADULT','FREE_ACCESS','AQUA_THERAPY','PERSONAL_CHILD']),
  capacity:  z.number().int().min(1).max(50),
});

// GET my-schedules — only ACTIVE schedules
router.get('/my-schedules', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.ok(res, { data: [] }); return; }
    const schedules = await prisma.schedule.findMany({
      where: { teacherId: teacher.id, isActive: true }, // ← only active
      include: {
        modality: true,
        slots: { where: { isActive: true }, include: { student: { select: { id: true, name: true, status: true } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    respond.ok(res, { data: schedules });
  } catch (err) { next(err); }
});

router.post('/my-schedules', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'Perfil de maestro no encontrado' }, 404); return; }

    const body = scheduleSchema.parse(req.body);
    const modalityConfig = await prisma.modalityConfig.findUnique({ where: { modality: body.modality as never } });
    if (!modalityConfig) { respond.error(res, { message: 'Modalidad no encontrada' }, 404); return; }

    if (body.capacity > modalityConfig.maxCapacity) {
      respond.error(res, { message: `El cupo máximo para esta modalidad es ${modalityConfig.maxCapacity}`, code: 'CAPACITY_EXCEEDED' }, 422);
      return;
    }

    const conflict = await prisma.schedule.findFirst({
      where: {
        teacherId: teacher.id, dayOfWeek: body.dayOfWeek, isActive: true,
        OR: [
          { startTime: { lte: body.startTime }, endTime: { gt: body.startTime } },
          { startTime: { lt: body.endTime },    endTime: { gte: body.endTime } },
          { startTime: { gte: body.startTime }, endTime: { lte: body.endTime } },
        ],
      },
    });
    if (conflict) {
      respond.error(res, { message: `Ya tienes un horario en ese día (${conflict.startTime}–${conflict.endTime})`, code: 'SCHEDULE_CONFLICT' }, 409);
      return;
    }

    const schedule = await prisma.schedule.create({
      data: { teacherId: teacher.id, modalityId: modalityConfig.id, dayOfWeek: body.dayOfWeek, startTime: body.startTime, endTime: body.endTime, capacity: body.capacity },
      include: { modality: true, slots: true },
    });
    respond.created(res, { data: schedule, message: 'Horario creado correctamente' });
  } catch (err) { next(err); }
});

router.patch('/my-schedules/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'No autorizado' }, 403); return; }

    const schedule = await prisma.schedule.findFirst({
      where: { id: req.params.id, teacherId: teacher.id, isActive: true },
      include: { slots: { where: { isActive: true } }, modality: true },
    });
    if (!schedule) { respond.error(res, { message: 'Horario no encontrado' }, 404); return; }

    const { capacity } = z.object({ capacity: z.number().int().min(1).max(50) }).parse(req.body);
    if (capacity < schedule.slots.length) {
      respond.error(res, { message: `No puedes reducir el cupo. Ya tienes ${schedule.slots.length} alumno(s).`, code: 'CAPACITY_BELOW_ENROLLED' }, 422);
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

// DELETE my-schedules/:id — hard delete if no students, refuse otherwise
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
        message: `No puedes eliminar este horario — tiene ${schedule.slots.length} alumno(s) activo(s).`,
        code: 'SCHEDULE_HAS_STUDENTS',
      }, 409);
      return;
    }

    // Hard delete — remove from DB entirely so it never shows up again
    await prisma.schedule.delete({ where: { id: req.params.id } });

    respond.noContent(res);
  } catch (err) { next(err); }
});

export default router;
