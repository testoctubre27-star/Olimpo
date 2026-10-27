import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

// ─── Schemas ──────────────────────────────────
const courseSchema = z.object({
  name:        z.string().min(2),
  description: z.string().optional(),
  price:       z.number().positive(),
  maxCapacity: z.number().int().min(1),
  startDate:   z.string().datetime(),
  endDate:     z.string().datetime(),
  period:      z.string().min(2),
  schedule:    z.string().optional(),
  teacherIds:  z.array(z.string().cuid()).optional(),
});

// ─────────────────────────────────────────────
// ADMIN — full course management
// ─────────────────────────────────────────────

// GET /courses — list all courses
router.get('/', requireTeacher, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const courses = await prisma.summerCourse.findMany({
      orderBy: { startDate: 'asc' },
      include: {
        teachers: {
          include: { teacher: { include: { user: { select: { name: true } } } } },
        },
        enrollments: true,
        _count: { select: { enrollments: true } },
      },
    });

    const result = courses.map(c => ({
      ...c,
      enrolledCount:    c.enrollments.filter(e => e.status === 'CONFIRMED').length,
      pendingCount:     c.enrollments.filter(e => e.status === 'PENDING').length,
      availableSpots:   c.maxCapacity - c.enrollments.filter(e => e.status === 'CONFIRMED').length,
    }));

    respond.ok(res, { data: result });
  } catch (err) { next(err); }
});

// GET /courses/:id

// GET /courses/active — active courses for bot
router.get('/active', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const courses = await prisma.summerCourse.findMany({
      where: { status: 'ACTIVE' },
      include: {
        teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
        _count: { select: { enrollments: { where: { status: 'CONFIRMED' } } } },
      },
    });
    const result = courses.map(c => ({
      ...c,
      availableSpots: c.maxCapacity - c._count.enrollments,
      isFull: c._count.enrollments >= c.maxCapacity,
    }));
    respond.ok(res, { data: result });
  } catch (err) { next(err); }
});

// GET /courses/:id
router.get('/:id', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const course = await prisma.summerCourse.findUnique({
      where: { id: req.params.id },
      include: {
        teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
        enrollments: {
          orderBy: { createdAt: 'asc' },
          include: { student: { select: { id: true, name: true, phone: true, status: true } } },
        },
      },
    });

    if (!course) { respond.error(res, { message: 'Curso no encontrado' }, 404); return; }
    respond.ok(res, { data: course });
  } catch (err) { next(err); }
});

// POST /courses — create course
router.post('/', requireAdmin, audit('COURSE_CREATED', 'SummerCourse'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = courseSchema.parse(req.body);

      if (new Date(body.endDate) <= new Date(body.startDate)) {
        respond.error(res, { message: 'La fecha de fin debe ser posterior a la de inicio' }, 422);
        return;
      }

      const course = await prisma.summerCourse.create({
        data: {
          name:        body.name,
          description: body.description,
          price:       body.price,
          maxCapacity: body.maxCapacity,
          startDate:   new Date(body.startDate),
          endDate:     new Date(body.endDate),
          period:      body.period,
          schedule:    body.schedule,
          teachers: body.teacherIds?.length
            ? { create: body.teacherIds.map(id => ({ teacherId: id })) }
            : undefined,
        },
        include: {
          teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
          enrollments: true,
        },
      });

      respond.created(res, { data: course, message: 'Curso creado correctamente' });
    } catch (err) { next(err); }
  }
);

// PATCH /courses/:id — update course
router.patch('/:id', requireAdmin, audit('COURSE_UPDATED', 'SummerCourse'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = courseSchema.partial().extend({
        status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'FINISHED']).optional(),
      }).parse(req.body);

      const existing = await prisma.summerCourse.findUnique({ where: { id: req.params.id } });
      if (!existing) { respond.error(res, { message: 'Curso no encontrado' }, 404); return; }

      await prisma.$transaction(async tx => {
        // Update teachers if provided
        if (body.teacherIds !== undefined) {
          await tx.summerCourseTeacher.deleteMany({ where: { courseId: req.params.id } });
          if (body.teacherIds.length > 0) {
            await tx.summerCourseTeacher.createMany({
              data: body.teacherIds.map(id => ({ courseId: req.params.id, teacherId: id })),
            });
          }
        }

        await tx.summerCourse.update({
          where: { id: req.params.id },
          data: {
            ...(body.name        !== undefined && { name: body.name }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.price       !== undefined && { price: body.price }),
            ...(body.maxCapacity !== undefined && { maxCapacity: body.maxCapacity }),
            ...(body.startDate   !== undefined && { startDate: new Date(body.startDate) }),
            ...(body.endDate     !== undefined && { endDate: new Date(body.endDate) }),
            ...(body.period      !== undefined && { period: body.period }),
            ...(body.schedule    !== undefined && { schedule: body.schedule }),
            ...(body.status      !== undefined && { status: body.status }),
          },
        });
      });

      const updated = await prisma.summerCourse.findUnique({
        where: { id: req.params.id },
        include: {
          teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
          enrollments: true,
        },
      });

      respond.ok(res, { data: updated, message: 'Curso actualizado' });
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
// ENROLLMENTS
// ─────────────────────────────────────────────

// PATCH /courses/:id/enrollments/:enrollmentId — confirm or cancel
router.patch('/:id/enrollments/:enrollmentId', requireAdmin,
  audit('ENROLLMENT_UPDATED', 'SummerCourseEnrollment'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, notes } = z.object({
        status: z.enum(['CONFIRMED', 'CANCELLED']),
        notes:  z.string().optional(),
      }).parse(req.body);

      const enrollment = await prisma.summerCourseEnrollment.findUnique({
        where: { id: req.params.enrollmentId },
        include: { course: true },
      });

      if (!enrollment) { respond.error(res, { message: 'Inscripción no encontrada' }, 404); return; }

      if (status === 'CONFIRMED') {
        // Check capacity
        const confirmed = await prisma.summerCourseEnrollment.count({
          where: { courseId: req.params.id, status: 'CONFIRMED' },
        });
        if (confirmed >= enrollment.course.maxCapacity) {
          respond.error(res, { message: 'No hay cupo disponible en este curso' }, 409);
          return;
        }
      }

      const updated = await prisma.summerCourseEnrollment.update({
        where: { id: req.params.enrollmentId },
        data: {
          status,
          notes,
          ...(status === 'CONFIRMED' && { paidAt: new Date(), confirmedById: req.user!.sub }),
        },
      });

      // Send WhatsApp notification
      const course = enrollment.course;
      const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };

      if (status === 'CONFIRMED') {
        const msg =
          `¡Felicidades, ${enrollment.studentName}! 🎉\n\n` +
          `Tu inscripción al *${course.name}* ha sido *confirmada*.\n\n` +
          `📅 Inicio: ${new Date(course.startDate).toLocaleDateString('es-MX', dateOpts)}\n` +
          `📅 Fin: ${new Date(course.endDate).toLocaleDateString('es-MX', dateOpts)}\n` +
          `⏰ Horario: ${course.schedule ?? course.period}\n` +
          `💰 Costo total: $${Number(course.price).toLocaleString('es-MX')} MXN\n\n` +
          `¡Te esperamos en *OLIMPO*! 🏊`;

        await WhatsAppAdapter.send({
          to: enrollment.studentPhone,
          body: msg,
          type: 'COURSE_CONFIRMED',
        });
      } else {
        const msg =
          `Hola ${enrollment.studentName},\n\n` +
          `Lamentamos informarte que tu inscripción al *${course.name}* ha sido cancelada.\n\n` +
          `Si tienes dudas, contáctanos. Quedamos a tus órdenes en *OLIMPO*. 🏊`;

        await WhatsAppAdapter.send({
          to: enrollment.studentPhone,
          body: msg,
          type: 'COURSE_CANCELLED',
        });
      }

      respond.ok(res, { data: updated, message: `Inscripción ${status === 'CONFIRMED' ? 'confirmada' : 'cancelada'}` });
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────
// TEACHER — my assigned courses
// ─────────────────────────────────────────────

router.get('/my-courses', requireTeacher, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId: req.user!.sub } });
    if (!teacher) { respond.ok(res, { data: [] }); return; }

    const courses = await prisma.summerCourse.findMany({
      where: { teachers: { some: { teacherId: teacher.id } } },
      include: {
        enrollments: { where: { status: 'CONFIRMED' } },
        teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
      },
      orderBy: { startDate: 'asc' },
    });

    respond.ok(res, { data: courses });
  } catch (err) { next(err); }
});

export default router;

// POST /courses/:id/enroll — bot creates PENDING enrollment
router.post('/:id/enroll', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentPhone, studentName } = z.object({
      studentPhone: z.string().min(1),
      studentName: z.string().min(1),
    }).parse(req.body);

    const course = await prisma.summerCourse.findUnique({
      where: { id: req.params.id },
      include: { enrollments: { where: { status: 'CONFIRMED' } } },
    });
    if (!course) { respond.error(res, { message: 'Curso no encontrado' }, 404); return; }
    if (course.status !== 'ACTIVE') { respond.error(res, { message: 'El curso no está disponible' }, 409); return; }
    if (course.enrollments.length >= course.maxCapacity) { respond.error(res, { message: 'El curso está lleno' }, 409); return; }

    const existing = await prisma.summerCourseEnrollment.findUnique({
      where: { courseId_studentPhone: { courseId: req.params.id, studentPhone } },
    });
    if (existing) { respond.error(res, { message: 'Este alumno ya está inscrito en el curso' }, 409); return; }

    const otherCourse = await prisma.summerCourseEnrollment.findFirst({
      where: {
        studentPhone,
        status: { in: ['PENDING', 'CONFIRMED'] },
        course: { status: { in: ['ACTIVE', 'DRAFT'] } },
      },
    });
    if (otherCourse) { respond.error(res, { message: 'Ya tienes una inscripción activa en otro curso' }, 409); return; }

    const enrollment = await prisma.summerCourseEnrollment.create({
      data: {
        courseId: req.params.id,
        studentPhone,
        studentName,
        status: 'PENDING',
      },
    });

    respond.created(res, { data: enrollment, message: 'Solicitud de inscripción enviada' });
  } catch (err) { next(err); }
});
