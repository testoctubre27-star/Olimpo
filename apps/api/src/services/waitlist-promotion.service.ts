import { prisma } from '../config/database';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { logger } from '../config/logger';

export async function promoteFromWaitlist(scheduleId: string): Promise<boolean> {
  // Find next person waiting (not notified, not confirmed, not skipped)
  const next = await prisma.waitingList.findFirst({
    where: {
      scheduleId,
      notifiedAt: null,
      confirmedAt: null,
      skippedAt: null,
    },
    orderBy: { position: 'asc', createdAt: 'asc' },
    include: { student: true, schedule: { include: { modality: true } } },
  });

  if (!next || !next.student) return false;

  try {
    await WhatsAppAdapter.send({
      to: next.student.phone,
      studentId: next.studentId,
      body: `¡Hola ${next.student.name}!\n\n¡Buenas noticias! Se liberó un lugar en ${next.schedule.modality?.name || 'tu horario'}.\n\nTienes 24 horas para confirmar tu lugar respondiendo a este mensaje o contactando a la administración.\n\n¡Gracias por formar parte de OLIMPO!`,
      type: 'WAITLIST_OFFER',
    });

    await prisma.waitingList.update({
      where: { id: next.id },
      data: { notifiedAt: new Date(), respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    logger.info(`[Waitlist] Promoted ${next.student.name} for schedule ${scheduleId}`);
    return true;
  } catch (err) {
    logger.error(`[Waitlist] Failed to promote for schedule ${scheduleId}`, { err });
    return false;
  }
}
