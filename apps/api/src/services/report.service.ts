import { prisma } from '../config/database';
import { cache } from '../config/redis';
import * as XLSX from 'xlsx';

export const ReportService = {
  async getDashboard() {
    const cached = await cache.get<ReturnType<typeof buildDashboard>>('dashboard:main');
    if (cached) return cached;

    const data = await buildDashboard();
    await cache.set('dashboard:main', data, cache.TTL.MEDIUM);
    return data;
  },

  async getFinancialReport(params: { from: Date; to: Date }) {
    const payments = await prisma.payment.findMany({
      where: {
        status: 'CONFIRMED',
        confirmedAt: { gte: params.from, lte: params.to },
      },
      include: {
        student: { select: { name: true, phone: true, modality: true } },
      },
      orderBy: { confirmedAt: 'desc' },
    });

    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return { payments, total, from: params.from, to: params.to };
  },

  async exportFinancialExcel(params: { from: Date; to: Date }): Promise<Buffer> {
    const report = await ReportService.getFinancialReport(params);

    const rows = report.payments.map((p) => ({
      'Alumno': p.student.name,
      'Teléfono': p.student.phone,
      'Modalidad': p.student.modality,
      'Tipo de pago': p.type,
      'Monto (MXN)': Number(p.amount),
      'Período': p.period ?? '',
      'Fecha confirmación': p.confirmedAt?.toLocaleDateString('es-MX') ?? '',
      'Notas': p.notes ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');

    // Summary sheet
    const summaryData = [
      { 'Concepto': 'Total período', 'Valor': report.total },
      { 'Concepto': 'Total pagos', 'Valor': report.payments.length },
      { 'Concepto': 'Desde', 'Valor': params.from.toLocaleDateString('es-MX') },
      { 'Concepto': 'Hasta', 'Valor': params.to.toLocaleDateString('es-MX') },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  },
};

async function buildDashboard() {
  const now = new Date();
  const currentPeriod = now.toISOString().slice(0, 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [
    totalStudents,
    activeStudents,
    delinquentStudents,
    suspendedStudents,
    monthlyRevenue,
    yearlyRevenue,
    scheduleOccupancy,
    recentPayments,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'DELINQUENT' } }),
    prisma.student.count({ where: { status: 'SUSPENDED' } }),
    prisma.payment.aggregate({
      where: { status: 'CONFIRMED', period: currentPeriod },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'CONFIRMED', confirmedAt: { gte: startOfYear } },
      _sum: { amount: true },
    }),
    prisma.schedule.findMany({
      where: { isActive: true },
      include: {
        modality: true,
        slots: { where: { isActive: true } },
        waitingList: { where: { confirmedAt: null, skippedAt: null } },
      },
    }),
    prisma.payment.findMany({
      where: { status: 'CONFIRMED', confirmedAt: { gte: startOfMonth } },
      include: { student: { select: { name: true } } },
      orderBy: { confirmedAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    students: {
      total: totalStudents,
      active: activeStudents,
      delinquent: delinquentStudents,
      suspended: suspendedStudents,
    },
    revenue: {
      monthly: Number(monthlyRevenue._sum.amount ?? 0),
      yearly: Number(yearlyRevenue._sum.amount ?? 0),
    },
    schedules: scheduleOccupancy.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      modality: s.modality.modality,
      capacity: s.modality.maxCapacity,
      occupied: s.slots.length,
      waitingCount: s.waitingList.length,
      occupancyPct: Math.round((s.slots.length / s.modality.maxCapacity) * 100),
    })),
    recentPayments,
    generatedAt: new Date().toISOString(),
  };
}
