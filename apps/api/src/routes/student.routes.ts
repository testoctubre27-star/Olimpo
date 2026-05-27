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
  name:           z.string().min(2, 'El nombre es requerido'),
  phone:          z.string().min(8, 'El teléfono es requerido'),
  modality:       z.enum([
    'BABY_PHASE1','BABY_PHASE2','BABY_PHASE3',
    'GROUP_CHILD','GROUP_ADULT','FREE_ACCESS','AQUA_THERAPY','PERSONAL_CHILD',
  ]),
  scheduleId:     z.string().cuid().optional(),   // optional — assigned later
  teacherId:      z.string().cuid().optional(),
  tutorName:      z.string().optional(),

  // Payment info
  registerPayment:   z.boolean().default(false),
  paymentType:       z.enum(['ENROLLMENT','MONTHLY']).optional(),
  paymentPeriod:     z.string().regex(/^\d{4}-\d{2}$/).optional(),  // YYYY-MM
  paymentAmount:     z.number().positive().optional(),
  paymentNotes:      z.string().optional(),
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
