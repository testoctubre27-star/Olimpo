import { prisma } from '../config/database';
import { StudentStatus, ConversationState } from '@prisma/client';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { templates } from '../adapters/templates';
import { logger } from '../config/logger';

export async function markDelinquentStudents(): Promise<void> {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const monthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  // Find active students with paymentDay set, past due, no confirmed payment this month
  const students = await prisma.student.findMany({
    where: {
      status: 'ACTIVE',
      paymentDay: { not: null },
    },
    include: {
      payments: {
        where: { period: monthYear, status: 'CONFIRMED' },
        take: 1,
      },
    },
  });

  let marked = 0;
  for (const student of students) {
    if (student.payments.length > 0) continue;
    const payDay = student.paymentDay!;
    // Mark as delinquent if past due date (day > paymentDay) and not already handled
    if (dayOfMonth <= payDay) continue;

    const jobName = `delinquency-mark-${student.id}-${monthYear}`;
    const alreadyDone = await prisma.automationLog.findFirst({
      where: { jobName, status: 'SUCCESS' },
    });
    if (alreadyDone) continue;

    try {
      await prisma.student.update({
        where: { id: student.id },
        data: {
          status: StudentStatus.DELINQUENT,
          conversationState: ConversationState.DELINQUENT,
        },
      });

      await WhatsAppAdapter.send({
        to: student.phone,
        studentId: student.id,
        body: templates.paymentOverdue(student.name, payDay),
        type: 'PAYMENT_OVERDUE',
      });

      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'SUCCESS',
          details: { payDay, dayOfMonth, monthYear },
        },
      });
      marked++;
      logger.info(`[Delinquency] Marked ${student.name} as DELINQUENT`);
    } catch (err) {
      logger.error(`[Delinquency] Failed ${student.name}`, { err });
      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
  logger.info(`[Delinquency] Done - marked: ${marked}`);
}
