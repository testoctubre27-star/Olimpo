import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { StudentService } from '../services/student.service';
import { prisma } from '../config/database';
import { respond } from '../utils/response';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

const activateSchema = z.object({
  scheduleId: z.string().cuid(),
  teacherId:  z.string().cuid().optional(),
});

// ─── CREATE STUDENT MANUALLY (admin) ─────────
const createStudentSchema = z.object({
  name:     z.string().min(2, 'El nombre es requerido'),
  phone:    z.string().min(8, 'El teléfono es requerido'),
  modality: z.enum([
    'BABY_PHASE1','BABY_PHASE2','BABY_PHASE3',
    'GROUP_CHILD','GROUP_ADULT','FREE_ACCESS','AQUA_THERAPY','PERSONAL_CHILD',
  ]).default('FREE_ACCESS'),

  // All optional — assigned later by admin
  scheduleId:  z.string().optional().nullable(),
  teacherId:   z.string().optional().nullable(),
  tutorName:   z.string().optional().nullable(),

  // Payment — all optional
  registerPayment: z.boolean().optional().default(false),
  paymentType:     z.enum(['ENROLLMENT','MONTHLY']).optional().default('MONTHLY'),
  paymentPeriod:   z.string().optional(),
  paymentAmount:   z.number().optional(),
  paymentNotes:    z.string().optional(),
});

router.post('/', requireAdmin, audit('STUDENT_CREATED_MANUALLY', 'Student'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createStudentSchema.parse(req.body);

      // Phone must be unique
      const existing = await prisma.student.findUnique({ where: { phone: body.phone } });
      if (existing) {
        respond.error(res, { message: 'Ya existe un alumno registrado con ese teléfono', code: 'DUPLICATE_PHONE' }, 409);
        return;
      }

      // Verify schedule only if provided
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let schedule: any = null;
      if (body.scheduleId) {
        schedule = await prisma.schedule.findUnique({
          where: { id: body.scheduleId },
          include: { slots: { where: { isActive: true } }, modality: true },
        });
        if (!schedule) {
          respond.error(res, { message: 'El horario seleccionado no existe' }, 404);
          return;
        }
        const maxCap = schedule.capacity ?? schedule.modality.maxCapacity;
        if ((schedule.slots?.length ?? 0) >= maxCap) {
          respond.error(res, { message: 'El horario seleccionado ya no tiene cupo disponible' }, 409);
          return;
        }
      }

      // Get teacher from schedule if not provided
      const teacherId = body.teacherId
        ?? (body.scheduleId ? (await prisma.scheduleSlot.findFirst({ where: { scheduleId: body.scheduleId, isActive: true } }))?.teacherId : undefined)
        ?? undefined;

      // Create student directly as ACTIVE
      const student = await prisma.student.create({
        data: {
          name:                 body.name,
          phone:                body.phone,
          modality:             body.modality,
          tutorName:            body.tutorName,
          conversationState:    'ACTIVE',
          status:               'ACTIVE',
          teacherId:            teacherId ?? null,
          regulationAcceptedAt: new Date(),
          regulationVersion:    '1.0',
          enrolledAt:           new Date(),
          conversationData:     {},
        },
      });

      // Create schedule slot only if schedule was provided
      if (body.scheduleId) {
        await prisma.scheduleSlot.create({
          data: {
            scheduleId: body.scheduleId,
            studentId:  student.id,
            teacherId:  teacherId ?? null,
            isActive:   true,
          },
        });
      }

      // Register payment if requested
      if (body.registerPayment && body.paymentType) {
        const period = body.paymentPeriod
          ?? new Date().toISOString().slice(0, 7); // default current month

        const fallbackFee = schedule
          ? (typeof schedule.modality.monthlyFee === 'object'
              ? (schedule.modality.monthlyFee as { toNumber: () => number }).toNumber()
              : Number(schedule.modality.monthlyFee))
          : 0;
        const amount = body.paymentAmount
          ?? (body.paymentType === 'ENROLLMENT' ? 200 : fallbackFee);

        await prisma.payment.create({
          data: {
            studentId:     student.id,
            type:          body.paymentType,
            amount:        amount,
            period:        period,
            status:        'CONFIRMED',
            confirmedById: req.user!.sub,
            notes:         body.paymentNotes ?? 'Pago registrado al crear alumno manualmente',
          },
        });
      }

      // Create bot session so the alumno is recognized if writes on WhatsApp
      await prisma.botSession.upsert({
        where: { phone: body.phone },
        update: { state: 'ACTIVE' },
        create: { phone: body.phone, state: 'ACTIVE', data: {} },
      });

      const full = await prisma.student.findUnique({
        where: { id: student.id },
        include: {
          payments: { orderBy: { createdAt: 'desc' } },
          scheduleSlots: {
            where: { isActive: true },
            include: { schedule: { include: { modality: true } } },
          },
        },
      });

      respond.created(res, { data: full, message: `Alumno ${student.name} creado y activado correctamente` });
    } catch (err) { next(err); }
  }
);

// ─── LIST ─────────────────────────────────────
router.get('/', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await StudentService.list({
      status: req.query.status as never,
      search: req.query.search as string,
      page:   req.query.page   ? Number(req.query.page)  : undefined,
      limit:  req.query.limit  ? Number(req.query.limit) : undefined,
    });
    respond.ok(res, { data: result.items, meta: { total: result.total, page: result.page, pages: result.pages } });
  } catch (err) { next(err); }
});

// ─── DETAIL ───────────────────────────────────
router.get('/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const student = await StudentService.getById(req.params.id);
    respond.ok(res, { data: student });
  } catch (err) { next(err); }
});

// ─── UPDATE ───────────────────────────────────
router.patch('/:id', requireAdmin, audit('STUDENT_UPDATED', 'Student'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = z.object({
        name:       z.string().min(2).optional(),
        phone:      z.string().min(8).optional(),
        modality:   z.enum(['BABY_PHASE1','BABY_PHASE2','BABY_PHASE3','GROUP_CHILD','GROUP_ADULT','FREE_ACCESS','AQUA_THERAPY','PERSONAL_CHILD']).optional(),
        tutorName:  z.string().optional().nullable(),
        teacherId:  z.string().optional().nullable(),
        status:     z.enum(['ACTIVE','DELINQUENT','SUSPENDED','INACTIVE']).optional(),
        notes:      z.string().optional().nullable(),
        paymentDay: z.number().int().min(1).max(28).optional().nullable(),
      }).parse(req.body);

      // Phone uniqueness check (only if changing phone)
      if (body.phone) {
        const existing = await prisma.student.findFirst({
          where: { phone: body.phone, id: { not: req.params.id } },
        });
        if (existing) {
          respond.error(res, { message: 'Ya existe otro alumno con ese teléfono', code: 'DUPLICATE_PHONE' }, 409);
          return;
        }
      }

      const student = await prisma.student.update({
        where: { id: req.params.id },
        data: {
          ...(body.name      !== undefined && { name: body.name }),
          ...(body.phone     !== undefined && { phone: body.phone }),
          ...(body.modality  !== undefined && { modality: body.modality }),
          ...(body.tutorName !== undefined && { tutorName: body.tutorName }),
          ...(body.teacherId !== undefined && { teacherId: body.teacherId }),
          ...(body.status    !== undefined && { status: body.status, conversationState: body.status as never }),
          ...(body.notes      !== undefined && { notes: body.notes }),
          ...(body.paymentDay !== undefined && { paymentDay: body.paymentDay }),
        },
        include: {
          payments:      { orderBy: { createdAt: 'desc' }, take: 5 },
          teacher:       { include: { user: { select: { name: true } } } },
          scheduleSlots: { where: { isActive: true }, include: { schedule: { include: { modality: true } } } },
        },
      });

      // Sync bot session phone if phone changed
      if (body.phone) {
        await prisma.botSession.upsert({
          where:  { phone: body.phone },
          update: {},
          create: { phone: body.phone, state: student.conversationState, data: {} },
        });
      }

      respond.ok(res, { data: student, message: 'Alumno actualizado correctamente' });
    } catch (err) { next(err); }
  }
);

// ─── ASSIGN SCHEDULE ──────────────────────────
router.post('/:id/assign-schedule', requireTeacher, audit('SCHEDULE_ASSIGNED', 'Student'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { scheduleId } = z.object({
        scheduleId: z.string().nullable(),
      }).parse(req.body);

      const student = await prisma.student.findUnique({ where: { id: req.params.id } });
      if (!student) { respond.error(res, { message: 'Alumno no encontrado' }, 404); return; }

      // Remove existing active slot and clear teacherId from student
      await prisma.scheduleSlot.updateMany({
        where: { studentId: req.params.id, isActive: true },
        data:  { isActive: false, releasedAt: new Date() },
      });

      // If no new schedule being assigned, also clear student.teacherId
      if (!scheduleId) {
        await prisma.student.update({
          where: { id: req.params.id },
          data:  { teacherId: null },
        });
      }

      if (scheduleId) {
        // Verify schedule exists and has capacity
        const schedule = await prisma.schedule.findUnique({
          where: { id: scheduleId },
          include: { slots: { where: { isActive: true } } },
        });
        if (!schedule) { respond.error(res, { message: 'Horario no encontrado' }, 404); return; }
        if (schedule.slots.length >= schedule.capacity) {
          respond.error(res, { message: 'El horario está lleno', code: 'SCHEDULE_FULL' }, 409); return;
        }

        const slotTeacherId = schedule.teacherId ?? student.teacherId ?? undefined;

        // Check for existing slot (may be inactive from previous removal)
        const existingSlot = await prisma.scheduleSlot.findFirst({
          where: { scheduleId, studentId: req.params.id },
        });

        if (existingSlot) {
          // Reactivate — avoids unique constraint violation on re-add
          await prisma.scheduleSlot.update({
            where: { id: existingSlot.id },
            data:  { isActive: true, releasedAt: null, teacherId: slotTeacherId },
          });
        } else {
          await prisma.scheduleSlot.create({
            data: { scheduleId, studentId: req.params.id, teacherId: slotTeacherId },
          });
        }

        // Update student.teacherId so they appear in "Mis alumnos" of the teacher
        if (slotTeacherId) {
          await prisma.student.update({
            where: { id: req.params.id },
            data:  { teacherId: slotTeacherId },
          });
        }
      }

      const updated = await prisma.student.findUnique({
        where: { id: req.params.id },
        include: {
          scheduleSlots: {
            where: { isActive: true },
            include: { schedule: { include: { modality: true } } },
          },
        },
      });

      respond.ok(res, { data: updated, message: scheduleId ? 'Horario asignado correctamente' : 'Horario removido' });
    } catch (err) { next(err); }
  }
);

// ─── ACTIVATE ─────────────────────────────────
router.post('/:id/activate', requireAdmin, audit('STUDENT_ACTIVATED', 'Student'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { scheduleId, teacherId } = activateSchema.parse(req.body);
      const student = await StudentService.activate(req.params.id, scheduleId, teacherId);
      respond.ok(res, { data: student, message: 'Alumno activado correctamente' });
    } catch (err) { next(err); }
  }
);

// ─── SUSPEND ──────────────────────────────────
router.post('/:id/suspend', requireAdmin, audit('STUDENT_SUSPENDED', 'Student'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await StudentService.suspend(req.params.id);
      respond.noContent(res);
    } catch (err) { next(err); }
  }
);

export default router;
