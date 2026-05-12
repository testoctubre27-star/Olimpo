import { PaymentType, PaymentStatus, StudentStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { NotFoundError, ConflictError } from '../utils/errors';

export const PaymentService = {
  /**
   * Calculate proportional monthly fee when student joins mid-month.
   * Formula: (remaining_days / days_in_month) * monthly_fee
   */
  calculateProportional(monthlyFee: number, joiningDate: Date): number {
    const year = joiningDate.getFullYear();
    const month = joiningDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = joiningDate.getDate();
    const remainingDays = daysInMonth - dayOfMonth + 1;

    // Round to 2 decimal places using integer math to avoid float drift
    return Math.round((monthlyFee * remainingDays / daysInMonth) * 100) / 100;
  },

  async listByStudent(studentId: string) {
    return prisma.payment.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createEnrollment(studentId: string, confirmedById: string) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundError('Alumno');

    // Check no existing confirmed enrollment for the year
    const year = new Date().getFullYear().toString();
    const existing = await prisma.payment.findFirst({
      where: {
        studentId,
        type: PaymentType.ENROLLMENT,
        status: PaymentStatus.CONFIRMED,
        period: year,
      },
    });
    if (existing) throw new ConflictError('El alumno ya tiene inscripción anual pagada este año');

    const payment = await prisma.payment.create({
      data: {
        studentId,
        type: PaymentType.ENROLLMENT,
        status: PaymentStatus.CONFIRMED,
        amount: 200,
        period: year,
        confirmedAt: new Date(),
        confirmedById,
        notes: 'Inscripción anual',
      },
    });

    const enrollmentExpiresAt = new Date();
    enrollmentExpiresAt.setFullYear(enrollmentExpiresAt.getFullYear() + 1);

    await prisma.student.update({
      where: { id: studentId },
      data: { enrollmentPaidAt: new Date(), enrollmentExpiresAt },
    });

    await cache.delPattern('dashboard:*');
    return payment;
  },

  async createMonthly(params: {
    studentId: string;
    period: string;       // "2026-05"
    amount?: number;      // if provided, uses this (e.g. proportional)
    confirmedById: string;
    notes?: string;
  }) {
    const student = await prisma.student.findUnique({
      where: { id: params.studentId },
      include: {
        scheduleSlots: { where: { isActive: true }, include: { schedule: { include: { modality: true } } } },
      },
    });
    if (!student) throw new NotFoundError('Alumno');

    // Check no duplicate for this period
    const existing = await prisma.payment.findFirst({
      where: {
        studentId: params.studentId,
        type: { in: [PaymentType.MONTHLY, PaymentType.PROPORTIONAL] },
        status: PaymentStatus.CONFIRMED,
        period: params.period,
      },
    });
    if (existing) throw new ConflictError(`Ya existe un pago confirmado para el período ${params.period}`);

    // Determine amount
    let amount = params.amount;
    let type = PaymentType.MONTHLY;

    if (!amount) {
      const modalityConfig = student.scheduleSlots[0]?.schedule.modality;
      if (!modalityConfig) throw new ConflictError('El alumno no tiene modalidad asignada');
      amount = Number(modalityConfig.monthlyFee);
    }

    // Detect if proportional (first payment of the month and joining mid-month)
    const [year, month] = params.period.split('-').map(Number);
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() > 1) {
      const calc = PaymentService.calculateProportional(amount, now);
      if (params.amount === undefined) {
        amount = calc;
        type = PaymentType.PROPORTIONAL;
      }
    }

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          studentId: params.studentId,
          type,
          status: PaymentStatus.CONFIRMED,
          amount,
          period: params.period,
          confirmedAt: new Date(),
          confirmedById: params.confirmedById,
          notes: params.notes,
        },
      });

      // Reactivate if was delinquent
      if (student.status === StudentStatus.DELINQUENT || student.status === StudentStatus.SUSPENDED) {
        await tx.student.update({
          where: { id: params.studentId },
          data: { status: StudentStatus.ACTIVE },
        });
      }

      return p;
    });

    await cache.delPattern('dashboard:*');
    return payment;
  },

  async getDelinquentStudents() {
    const currentPeriod = new Date().toISOString().slice(0, 7); // "2026-05"

    // Students that are ACTIVE but have no confirmed payment this period
    const paid = await prisma.payment.findMany({
      where: {
        period: currentPeriod,
        status: PaymentStatus.CONFIRMED,
        type: { in: [PaymentType.MONTHLY, PaymentType.PROPORTIONAL] },
      },
      select: { studentId: true },
    });

    const paidIds = paid.map((p) => p.studentId);

    return prisma.student.findMany({
      where: {
        status: StudentStatus.ACTIVE,
        id: { notIn: paidIds },
      },
      include: { scheduleSlots: { where: { isActive: true } } },
    });
  },
};