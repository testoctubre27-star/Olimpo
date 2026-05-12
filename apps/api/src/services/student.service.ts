import { StudentStatus, ConversationState } from '@prisma/client';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { NotFoundError, ConflictError } from '../utils/errors';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { templates } from '../adapters/templates';

export const StudentService = {
  async list(params: {
    status?: StudentStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' as const } },
              { phone: { contains: params.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          teacher: { include: { user: { select: { name: true } } } },
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
          scheduleSlots: { where: { isActive: true }, include: { schedule: true } },
        },
      }),
      prisma.student.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },

  async getById(id: string) {
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        payments: { orderBy: { createdAt: 'desc' } },
        scheduleSlots: {
          where: { isActive: true },
          include: { schedule: { include: { modality: true } } },
        },
        waitingList: { include: { schedule: { include: { modality: true } } } },
      },
    });
    if (!student) throw new NotFoundError('Alumno');
    return student;
  },

  async getByPhone(phone: string) {
    const student = await prisma.student.findUnique({ where: { phone } });
    if (!student) throw new NotFoundError('Alumno');
    return student;
  },

  async activate(studentId: string, scheduleId: string, teacherId?: string) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundError('Alumno');

    // Check slot availability
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        modality: true,
        slots: { where: { isActive: true } },
      },
    });
    if (!schedule) throw new NotFoundError('Horario');

    if (schedule.slots.length >= schedule.modality.maxCapacity) {
      throw new ConflictError('El horario seleccionado ya no tiene cupo disponible');
    }

    // Duplicate slot check
    const existing = await prisma.scheduleSlot.findUnique({
      where: { scheduleId_studentId: { scheduleId, studentId } },
    });
    if (existing?.isActive) throw new ConflictError('El alumno ya tiene este horario asignado');

    await prisma.$transaction(async (tx) => {
      // Create slot
      await tx.scheduleSlot.upsert({
        where: { scheduleId_studentId: { scheduleId, studentId } },
        create: { scheduleId, studentId, teacherId, isActive: true },
        update: { teacherId, isActive: true, releasedAt: null },
      });

      // Update student status
      await tx.student.update({
        where: { id: studentId },
        data: {
          status: StudentStatus.ACTIVE,
          conversationState: ConversationState.ACTIVE,
          teacherId,
        },
      });
    });

    // Send welcome WhatsApp
    const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const scheduleStr = `${DAYS[schedule.dayOfWeek]} ${schedule.startTime}`;
    const teacherName = teacherId
      ? (await prisma.teacher.findUnique({ where: { id: teacherId }, include: { user: true } }))?.user.name ?? 'Por asignar'
      : 'Por asignar';

    await WhatsAppAdapter.send({
      to: student.phone,
      studentId,
      body: templates.welcome(student.name, scheduleStr, teacherName),
      type: 'WELCOME',
    });

    await cache.delPattern('dashboard:*');
    return StudentService.getById(studentId);
  },

  async suspend(studentId: string) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundError('Alumno');

    await prisma.$transaction(async (tx) => {
      // Release all active slots
      await tx.scheduleSlot.updateMany({
        where: { studentId, isActive: true },
        data: { isActive: false, releasedAt: new Date() },
      });

      await tx.student.update({
        where: { id: studentId },
        data: { status: StudentStatus.SUSPENDED, conversationState: ConversationState.SUSPENDED },
      });
    });

    await WhatsAppAdapter.send({
      to: student.phone,
      studentId,
      body: templates.slotReleased(student.name),
      type: 'SLOT_RELEASED',
    });

    await cache.delPattern('dashboard:*');
    await cache.delPattern('schedules:*');
  },

  async markDelinquent(studentId: string) {
    await prisma.student.update({
      where: { id: studentId },
      data: { status: StudentStatus.DELINQUENT, conversationState: ConversationState.DELINQUENT },
    });
  },
};
