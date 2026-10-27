import { prisma } from '../config/database';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { logger } from '../config/logger';

export async function expireWaitlistOffers(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

  // Find expired waitlist entries (notified more than 24h ago, not confirmed/skipped)
  const expired = await prisma.waitingList.findMany({
    where: {
      notifiedAt: { lt: cutoff, not: null },
      confirmedAt: null,
      skippedAt: null,
    },
    include: {
      student: true,
      schedule: { include: { modality: true } },
    },
  });

  for (const entry of expired) {
    const jobName = `waitlist-expire-${entry.id}`;
    const alreadyDone = await prisma.automationLog.findFirst({
      where: { jobName, status: 'SUCCESS' },
    });
    if (alreadyDone) continue;

    try {
      // Mark as skipped/expired
      await prisma.waitingList.update({
        where: { id: entry.id },
        data: { skippedAt: new Date() },
      });

      // Try to offer to next person (waiting, not notified)
      const next = await prisma.waitingList.findFirst({
        where: {
          scheduleId: entry.scheduleId,
          notifiedAt: null,
          confirmedAt: null,
          skippedAt: null,
        },
        orderBy: { position: 'asc', createdAt: 'asc' },
        include: { student: true },
      });

      if (next && next.student) {
        await WhatsAppAdapter.send({
          to: next.student.phone,
          studentId: next.studentId,
          body: `¡Hola ${next.student.name}!\n\nSe liberó un lugar en la lista de espera para ${entry.schedule.modality?.name || 'tu horario'}.\n\nTienes 24 horas para confirmar tu lugar respondiendo a este mensaje o contactando a la administración.\n\n¡Gracias por formar parte de OLIMPO!`,
          type: 'WAITLIST_OFFER',
        });
        await prisma.waitingList.update({
          where: { id: next.id },
          data: { notifiedAt: new Date(), respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        });
      }

      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'SUCCESS',
          details: { scheduleId: entry.scheduleId, studentId: entry.studentId },
        },
      });
      logger.info(`[Waitlist] Expired entry ${entry.id}, offered to next`);
    } catch (err) {
      logger.error(`[Waitlist] Failed to expire ${entry.id}`, { err });
      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
  logger.info(`[Waitlist] Done - expired: ${expired.length}`);
}
