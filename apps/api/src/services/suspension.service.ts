import { prisma } from '../config/database';
import { StudentStatus, ConversationState } from '@prisma/client';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { templates } from '../adapters/templates';
import { logger } from '../config/logger';

export async function suspendDelinquentStudents(): Promise<void> {
  const today = new Date();
  const dayOfMonth = today.getDate();
  if (dayOfMonth < 6) {
    logger.info('[Suspension] Skipping - not day 6 or after');
    return;
  }

  const monthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  // Find students that are DELINQUENT with pending payment this month
  const students = await prisma.student.findMany({
    where: {
      status: 'DELINQUENT',
    },
    include: {
      payments: {
        where: { period: monthYear, status: 'CONFIRMED' },
        take: 1,
      },
      scheduleSlots: {
        where: { isActive: true },
      },
    },
  });

  let suspended = 0;
  for (const student of students) {
    if (student.payments.length > 0) continue;
    
    const jobName = `suspension-day6-${student.id}-${monthYear}`;
    const alreadyDone = await prisma.automationLog.findFirst({
      where: { jobName, status: 'SUCCESS' },
    });
    if (alreadyDone) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.scheduleSlot.updateMany({
          where: { studentId: student.id, isActive: true },
          data: { isActive: false, releasedAt: new Date() },
        });
        await tx.student.update({
          where: { id: student.id },
          data: { status: StudentStatus.SUSPENDED, conversationState: ConversationState.SUSPENDED },
        });
      });

      await WhatsAppAdapter.send({
        to: student.phone,
        studentId: student.id,
        body: templates.slotReleased(student.name),
        type: 'SLOT_RELEASED',
      });

      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'SUCCESS',
          details: { monthYear, student: student.name },
        },
      });
      suspended++;
      logger.info(`[Suspension] Suspended ${student.name}`);
    } catch (err) {
      logger.error(`[Suspension] Failed ${student.name}`, { err });
      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
  logger.info(`[Suspension] Done - suspended: ${suspended}`);
}
