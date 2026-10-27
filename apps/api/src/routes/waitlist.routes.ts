import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { respond } from '../utils/response';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';

const router = Router();
router.use(authenticate);

// Add student to waitlist
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      scheduleId: z.string().cuid(),
      studentId: z.string().cuid(),
    }).parse(req.body);

    const count = await prisma.waitingList.count({
      where: { scheduleId: body.scheduleId, confirmedAt: null, skippedAt: null },
    });

    const entry = await prisma.waitingList.create({
      data: {
        scheduleId: body.scheduleId,
        studentId: body.studentId,
        position: count + 1,
      },
      include: { student: true, schedule: true },
    });

    respond.created(res, { data: entry, message: 'Alumno agregado a lista de espera' });
  } catch (err) { next(err); }
});

// Notify next in waitlist when slot opens
router.post('/notify/:scheduleId', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const next = await prisma.waitingList.findFirst({
      where: {
        scheduleId: req.params.scheduleId,
        notifiedAt: null,
        confirmedAt: null,
        skippedAt: null,
      },
      orderBy: { position: 'asc', createdAt: 'asc' },
      include: { student: true, schedule: { include: { modality: true } } },
    });

    if (!next) {
      respond.ok(res, { data: null, message: 'No hay alumnos en lista de espera' });
      return;
    }

    await WhatsAppAdapter.send({
      to: next.student.phone,
      studentId: next.studentId,
      body: `¡Hola ${next.student.name}!\n\nSe liberó un lugar en la lista de espera para ${next.schedule.modality?.name || 'tu horario'}.\n\nTienes 24 horas para confirmar tu lugar respondiendo a este mensaje o contactando a la administración.\n\n¡Gracias por formar parte de OLIMPO!`,
      type: 'WAITLIST_OFFER',
    });

    await prisma.waitingList.update({
      where: { id: next.id },
      data: { notifiedAt: new Date(), respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    respond.ok(res, { data: next, message: 'Siguiente en lista de espera notificado' });
  } catch (err) { next(err); }
});

export default router;
