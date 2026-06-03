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

// ─── Modality enum values ─────────────────────
const MODALITY_ENUM = z.enum([
  'BABY_PHASE1','BABY_PHASE2','BABY_PHASE3',
  'GROUP_CHILD','GROUP_ADULT','FREE_ACCESS',
  'AQUA_THERAPY','PERSONAL_CHILD',
]);

// Personal modalities always have capacity 1
const PERSONAL_MODALITIES = new Set([
  'BABY_PHASE1','BABY_PHASE2','BABY_PHASE3',
  'AQUA_THERAPY','PERSONAL_CHILD',
]);

// ─── ADMIN routes ──────────────────────────────

const createTeacherSchema = z.object({
  name: z.string().min(2), email: z.string().email(),
  password: z.string().min(6), phone: z.string().min(10),
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
          include: { modalities: { include: { modality: true } }, slots: { where: { isActive: true } } },
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
    if (existing) { respond.error(res, { message: 'Ya existe un usuario con ese email', code: 'DUPLICATE' }, 409); return; }

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
      name: z.string().min(2).optional(), phone: z.string().min(10).optional(),
      commissionPct: z.number().min(0).max(100).optional(), isActive: z.boolean().optional(),
    }).parse(req.body);

    const teacher = await prisma.teacher.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!teacher) { respond.error(res, { message: 'Maestro no encontrado' }, 404); return; }

    await prisma.teacher.update({ where: { id: req.params.id }, data: {
      ...(body.name && { displayName: body.name }),
      ...(body.phone && { phone: body.phone }),
      ...(body.commissionPct !== undefined && { commissionPct: body.commissionPct }),
    }});
    await prisma.user.update({ where: { id: teacher.userId }, data: {
      ...(body.name && { name: body.name }),
      ...(body.phone && { phone: body.phone }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    }});

    const updated = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { name: true, email: true, isActive: true } }, students: { select: { id: true } }, schedules: { where: { isActive: true } } },
    });
    respond.ok(res, { data: updated, message: 'Maestro actualizado' });
  } catch (err) { next(err); }
});

// ─── TEACHER routes ────────────────────────────

router.get('/my-students', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.ok(res, { data: [] }); return; }
    const students = await prisma.student.findMany({
      where: { teacherId: teacher.id },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        scheduleSlots: {
          where: { isActive: true },
          include: { schedule: { include: { modality: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    respond.ok(res, { data: students });
  } catch (err) { next(err); }
});

// ─── Schema for schedule with multiple modalities ─
const scheduleModalityItem = z.object({
  modality: MODALITY_ENUM,
  capacity: z.number().int().min(1).optional(), // optional — auto-set for personal modalities
});

const createScheduleSchema = z.object({
  dayOfWeek:  z.number().int().min(0).max(6),
  startTime:  z.string().regex(/^\d{2}:\d{2}$/),
  endTime:    z.string().regex(/^\d{2}:\d{2}$/),
  capacity:   z.number().int().min(1).max(50).optional(), // overall capacity (for grouped)
  modalities: z.array(scheduleModalityItem).min(1, 'Selecciona al menos una modalidad'),
});

// GET my-schedules
router.get('/my-schedules', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.ok(res, { data: [] }); return; }

    const schedules = await prisma.schedule.findMany({
      where: { teacherId: teacher.id, isActive: true },
      include: {
        modalities: {
          include: { modality: true },
        },
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

// POST my-schedules — create schedule with multiple modalities
router.post('/my-schedules', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'Perfil de maestro no encontrado' }, 404); return; }

    const body = createScheduleSchema.parse(req.body);

    if (body.startTime >= body.endTime) {
      respond.error(res, { message: 'La hora de inicio debe ser antes de la hora fin' }, 422); return;
    }

    // Check conflict
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
      respond.error(res, { message: `Conflicto con otro horario (${conflict.startTime}–${conflict.endTime})`, code: 'SCHEDULE_CONFLICT' }, 409); return;
    }

    // Resolve modality IDs and capacities
    const modalityRecords = await Promise.all(
      body.modalities.map(async (m) => {
        const config = await prisma.modalityConfig.findUnique({ where: { modality: m.modality as never } });
        if (!config) throw new Error(`Modalidad ${m.modality} no encontrada`);
        // Personal modalities always cap at 1; grouped use provided or config default
        const cap = PERSONAL_MODALITIES.has(m.modality)
          ? 1
          : (m.capacity ?? config.maxCapacity);
        return { modalityId: config.id, capacity: cap };
      })
    );

    // Overall schedule capacity = sum of individual modality capacities
    const totalCapacity = body.capacity ?? modalityRecords.reduce((sum, m) => sum + m.capacity, 0);

    const schedule = await prisma.schedule.create({
      data: {
        teacherId:  teacher.id,
        modalityId: modalityRecords[0].modalityId, // legacy field — keep first modality
        dayOfWeek:  body.dayOfWeek,
        startTime:  body.startTime,
        endTime:    body.endTime,
        capacity:   totalCapacity,
        modalities: {
          create: modalityRecords,
        },
      },
      include: {
        modalities: { include: { modality: true } },
        slots: true,
      },
    });

    respond.created(res, { data: schedule, message: 'Horario creado correctamente' });
  } catch (err) { next(err); }
});

// PATCH my-schedules/:id — edit time, modalities, capacity
router.patch('/my-schedules/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'No autorizado' }, 403); return; }

    const schedule = await prisma.schedule.findFirst({
      where: { id: req.params.id, teacherId: teacher.id, isActive: true },
      include: { slots: { where: { isActive: true } }, modalities: true },
    });
    if (!schedule) { respond.error(res, { message: 'Horario no encontrado' }, 404); return; }

    const body = z.object({
      startTime:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime:    z.string().regex(/^\d{2}:\d{2}$/).optional(),
      capacity:   z.number().int().min(1).max(50).optional(),
      modalities: z.array(scheduleModalityItem).min(1).optional(),
    }).parse(req.body);

    const startTime = body.startTime ?? schedule.startTime;
    const endTime   = body.endTime   ?? schedule.endTime;

    if (startTime >= endTime) {
      respond.error(res, { message: 'La hora de inicio debe ser antes de la hora fin' }, 422); return;
    }

    // Time conflict check (exclude self)
    if (body.startTime || body.endTime) {
      const conflict = await prisma.schedule.findFirst({
        where: {
          teacherId: teacher.id, dayOfWeek: schedule.dayOfWeek, isActive: true,
          id: { not: req.params.id },
          OR: [
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            { startTime: { lt: endTime },    endTime: { gte: endTime } },
            { startTime: { gte: startTime }, endTime: { lte: endTime } },
          ],
        },
      });
      if (conflict) {
        respond.error(res, { message: `Conflicto con otro horario (${conflict.startTime}–${conflict.endTime})`, code: 'SCHEDULE_CONFLICT' }, 409); return;
      }
    }

    // Recalculate modalities if provided
    let newCapacity = body.capacity ?? schedule.capacity;
    let firstModalityId = schedule.modalityId;

    if (body.modalities) {
      const modalityRecords = await Promise.all(
        body.modalities.map(async (m) => {
          const config = await prisma.modalityConfig.findUnique({ where: { modality: m.modality as never } });
          if (!config) throw new Error(`Modalidad ${m.modality} no encontrada`);
          const cap = PERSONAL_MODALITIES.has(m.modality) ? 1 : (m.capacity ?? config.maxCapacity);
          return { modalityId: config.id, capacity: cap };
        })
      );

      newCapacity = body.capacity ?? modalityRecords.reduce((sum, m) => sum + m.capacity, 0);
      firstModalityId = modalityRecords[0].modalityId;

      // Validate capacity vs enrolled
      if (newCapacity < schedule.slots.length) {
        respond.error(res, { message: `El cupo no puede ser menor al número de alumnos inscritos (${schedule.slots.length})`, code: 'CAPACITY_BELOW_ENROLLED' }, 422); return;
      }

      // Replace modalities (delete all, re-create)
      await prisma.scheduleModality.deleteMany({ where: { scheduleId: req.params.id } });
      await prisma.scheduleModality.createMany({
        data: modalityRecords.map(m => ({ scheduleId: req.params.id, ...m })),
      });
    } else {
      if (newCapacity < schedule.slots.length) {
        respond.error(res, { message: `El cupo no puede ser menor a los alumnos inscritos (${schedule.slots.length})`, code: 'CAPACITY_BELOW_ENROLLED' }, 422); return;
      }
    }

    const updated = await prisma.schedule.update({
      where: { id: req.params.id },
      data: { startTime, endTime, capacity: newCapacity, modalityId: firstModalityId },
      include: {
        modalities: { include: { modality: true } },
        slots: { where: { isActive: true }, include: { student: { select: { id: true, name: true } } } },
      },
    });

    respond.ok(res, { data: updated, message: 'Horario actualizado correctamente' });
  } catch (err) { next(err); }
});

// DELETE my-schedules/:id
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
      respond.error(res, { message: `No puedes eliminar este horario — tiene ${schedule.slots.length} alumno(s) activo(s).`, code: 'SCHEDULE_HAS_STUDENTS' }, 409); return;
    }

    await prisma.scheduleModality.deleteMany({ where: { scheduleId: req.params.id } });
    await prisma.schedule.delete({ where: { id: req.params.id } });
    respond.noContent(res);
  } catch (err) { next(err); }
});

// PATCH my-schedules/:id/pair
router.patch('/my-schedules/:id/pair', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await getTeacherFromUser(req.user!.sub);
    if (!teacher) { respond.error(res, { message: 'No autorizado' }, 403); return; }

    const { pairedWithId } = z.object({ pairedWithId: z.string().cuid().nullable() }).parse(req.body);

    const schedule = await prisma.schedule.findFirst({ where: { id: req.params.id, teacherId: teacher.id, isActive: true } });
    if (!schedule) { respond.error(res, { message: 'Horario no encontrado' }, 404); return; }

    if (pairedWithId) {
      const paired = await prisma.schedule.findFirst({ where: { id: pairedWithId, teacherId: teacher.id, isActive: true } });
      if (!paired) { respond.error(res, { message: 'El horario par no existe' }, 404); return; }
      if (pairedWithId === req.params.id) { respond.error(res, { message: 'Un horario no puede ser su propio par' }, 400); return; }
      await prisma.$transaction([
        prisma.schedule.update({ where: { id: req.params.id }, data: { pairedWithId } }),
        prisma.schedule.update({ where: { id: pairedWithId }, data: { pairedWithId: req.params.id } }),
      ]);
    } else {
      const current = await prisma.schedule.findUnique({ where: { id: req.params.id } });
      const clearSelf = prisma.schedule.update({ where: { id: req.params.id }, data: { pairedWithId: null } });
      if (current?.pairedWithId) {
        const clearPaired = prisma.schedule.update({ where: { id: current.pairedWithId }, data: { pairedWithId: null } });
        await prisma.$transaction([clearSelf, clearPaired]);
      } else {
        await clearSelf;
      }
    }

    respond.ok(res, { data: null, message: pairedWithId ? 'Horarios vinculados correctamente' : 'Vínculo eliminado' });
  } catch (err) { next(err); }
});

// POST /teachers/:id/reset-password — admin resets a teacher's password
router.post('/:id/reset-password', requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { password } = z.object({
        password: z.string().min(6, 'Mínimo 6 caracteres'),
      }).parse(req.body);

      const teacher = await prisma.teacher.findUnique({
        where: { id: req.params.id },
        include: { user: true },
      });
      if (!teacher) { respond.error(res, { message: 'Maestro no encontrado' }, 404); return; }

      const hashed = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: teacher.userId },
        data:  { password: hashed },
      });

      respond.ok(res, { data: null, message: `Contraseña actualizada para ${teacher.user.email}` });
    } catch (err) { next(err); }
  }
);

export default router;
