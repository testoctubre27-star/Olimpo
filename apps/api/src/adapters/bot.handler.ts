import { ConversationState, Modality } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { templates } from './templates';
import { logger } from '../config/logger';

// Maps user text → Modality enum
const MODALITY_MAP: Record<string, Modality> = {
  '1': Modality.PERSONAL_CHILD,
  '2': Modality.GROUP_CHILD,
  '3': Modality.GROUP_ADULT,
  '4': Modality.FREE_ACCESS,
  '5': Modality.AQUA_THERAPY,
};

export async function handleIncomingMessage(phone: string, body: string): Promise<void> {
  const text = body.trim().toUpperCase();

  // Get or create bot session
  let session = await prisma.botSession.findUnique({ where: { phone } });
  if (!session) {
    session = await prisma.botSession.create({
      data: { phone, state: ConversationState.NEW_CONTACT },
    });
  }

  logger.info('Bot incoming', { phone, state: session.state, text });

  switch (session.state) {

    case ConversationState.NEW_CONTACT: {
      await WhatsAppAdapter.send({ to: phone, body: templates.onboardingGreeting(), type: 'ONBOARDING_GREETING' });
      await prisma.botSession.update({
        where: { phone },
        data: { state: ConversationState.AWAITING_NAME },
      });
      break;
    }

    case ConversationState.AWAITING_NAME: {
      const name = body.trim();
      if (name.length < 2) {
        await WhatsAppAdapter.send({ to: phone, body: '¿Puedes decirme tu nombre completo?', type: 'RETRY' });
        break;
      }
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_MODALITY,
          data: { name },
        },
      });
      await WhatsAppAdapter.send({ to: phone, body: templates.askModality(), type: 'ASK_MODALITY' });
      break;
    }

    case ConversationState.AWAITING_MODALITY: {
      const modality = MODALITY_MAP[text];
      if (!modality) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }
      const sessionData = (session.data as Record<string, string>) ?? {};
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_SCHEDULE,
          data: { ...sessionData, modality },
        },
      });

      // Fetch available schedules for chosen modality
      const schedules = await prisma.schedule.findMany({
        where: {
          modality: { modality },
          isActive: true,
        },
        include: {
          slots: { where: { isActive: true } },
          modality: true,
        },
      });

      const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const available = schedules
        .filter((s) => s.slots.length < s.modality.maxCapacity)
        .map((s) => ({ day: DAYS[s.dayOfWeek], time: s.startTime, id: s.id }));

      if (available.length === 0) {
        await WhatsAppAdapter.send({
          to: phone,
          body: 'Lo sentimos, no hay horarios disponibles para esa modalidad en este momento. Te anotaremos en lista de espera cuando se libere un lugar.',
          type: 'NO_AVAILABILITY',
        });
        break;
      }

      await prisma.botSession.update({
        where: { phone },
        data: { data: { ...sessionData, modality, availableSchedules: available } },
      });

      await WhatsAppAdapter.send({
        to: phone,
        body: templates.askSchedule(available),
        type: 'ASK_SCHEDULE',
      });
      break;
    }

    case ConversationState.AWAITING_SCHEDULE: {
      const sessionData = (session.data as Record<string, unknown>) ?? {};
      const availableSchedules = (sessionData.availableSchedules as Array<{ day: string; time: string; id: string }>) ?? [];
      const idx = parseInt(text) - 1;
      const chosen = availableSchedules[idx];

      if (!chosen) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }

      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_REGULATION_ACCEPT,
          data: { ...sessionData, scheduleId: chosen.id },
        },
      });

      // TODO: replace with actual hosted URL
      const regulationUrl = 'https://olimpo.academy/reglamento';
      await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(regulationUrl), type: 'REGULATION' });
      break;
    }

    case ConversationState.AWAITING_REGULATION_ACCEPT: {
      if (text !== 'ACEPTO') {
        await WhatsAppAdapter.send({
          to: phone,
          body: 'Para continuar debes aceptar el reglamento respondiendo *ACEPTO*.',
          type: 'RETRY',
        });
        break;
      }

      const sessionData = (session.data as Record<string, string>) ?? {};

      // Record signature
      await prisma.regulationSignature.create({
        data: {
          studentPhone: phone,
          regulationVersion: '1.0',
        },
      });

      // Upsert student record
      await prisma.student.upsert({
        where: { phone },
        update: {
          name: sessionData.name,
          modality: sessionData.modality as Modality,
          conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
          regulationAcceptedAt: new Date(),
          regulationVersion: '1.0',
          conversationData: sessionData,
        },
        create: {
          phone,
          name: sessionData.name,
          modality: sessionData.modality as Modality,
          conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
          regulationAcceptedAt: new Date(),
          regulationVersion: '1.0',
          conversationData: sessionData,
        },
      });

      await prisma.botSession.update({
        where: { phone },
        data: { state: ConversationState.PENDING_PAYMENT_CONFIRMATION },
      });

      await WhatsAppAdapter.send({
        to: phone,
        body: templates.regulationConfirmed(sessionData.name),
        type: 'REGULATION_CONFIRMED',
      });
      break;
    }

    case ConversationState.ACTIVE:
    case ConversationState.DELINQUENT:
    case ConversationState.SUSPENDED:
    case ConversationState.PENDING_PAYMENT_CONFIRMATION: {
      // Existing students — hand off to admin or self-service queries
      await WhatsAppAdapter.send({
        to: phone,
        body: 'Hola, recibimos tu mensaje. Un administrador te atenderá en breve. También puedes escribir *ESTADO* para consultar tu cuenta.',
        type: 'HANDOFF',
      });
      break;
    }

    default: {
      logger.warn('Unknown bot state', { phone, state: session.state });
      break;
    }
  }
}
