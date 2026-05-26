import { ConversationState, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { templates } from './templates';
import { logger } from '../config/logger';

// ─── MenuItem for dynamic menu ────────────────
interface MenuItem {
  type: 'modality' | 'service' | 'course';
  id: string;
  modalityEnum?: string;
  name: string;
}

async function buildMenuItems(): Promise<MenuItem[]> {
  const items: MenuItem[] = [];

  const modalities = await prisma.modalityConfig.findMany({
    where: { isActive: true }, orderBy: { name: 'asc' },
  });
  for (const m of modalities)
    items.push({ type: 'modality', id: m.id, modalityEnum: m.modality, name: m.name });

  const services = await prisma.service.findMany({
    where: { isActive: true }, orderBy: { name: 'asc' },
  });
  for (const s of services)
    items.push({ type: 'service', id: s.id, name: s.name });

  const courses = await prisma.summerCourse.findMany({
    where: { status: 'ACTIVE' },
    include: { enrollments: { where: { status: 'CONFIRMED' } } },
    orderBy: { startDate: 'asc' },
  });
  for (const c of courses)
    if (c.enrollments.length < c.maxCapacity)
      items.push({ type: 'course', id: c.id, name: c.name });

  return items;
}

// ─── Session data type ────────────────────────
interface SessionData {
  name?: string;
  menuItems?: MenuItem[];
  selectedId?: string;
  selectedType?: string;
  modalityEnum?: string;
  availableSchedules?: { day: string; time: string; id: string }[];
  scheduleId?: string;
  courseId?: string;
  courseName?: string;
  isCourse?: boolean;
  awaitingCourseConfirm?: boolean; // pseudo-state stored in data
  [key: string]: unknown;
}

// ─── Main handler ─────────────────────────────
export async function handleIncomingMessage(phone: string, body: string): Promise<void> {
  const text = body.trim().toUpperCase();

  let session = await prisma.botSession.findUnique({ where: { phone } });
  if (!session) {
    session = await prisma.botSession.create({
      data: { phone, state: ConversationState.NEW_CONTACT },
    });
  }

  logger.info('Bot incoming', { phone, state: session.state, text: text.slice(0, 60) });

  const sd = (session.data ?? {}) as SessionData;

  // ── Intercept: awaiting course confirmation ──
  // Stored as a flag in conversationData instead of a separate enum state
  // because the ConversationState enum doesn't have AWAITING_COURSE_CONFIRM
  if (sd.awaitingCourseConfirm && session.state === ConversationState.AWAITING_MODALITY) {
    if (text === '1' || text === 'SÍ' || text === 'SI' || text === 'QUIERO') {
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_REGULATION_ACCEPT,
          data: { ...sd, awaitingCourseConfirm: false } as unknown as Prisma.InputJsonValue,
        },
      });
      await WhatsAppAdapter.send({
        to: phone,
        body: '¡Perfecto! 🎉 Antes de confirmar tu reserva, necesitamos que aceptes nuestro reglamento:',
        type: 'COURSE_CONFIRM',
      });
      await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
    } else if (text === '2' || text.includes('NO')) {
      const menuItems = await buildMenuItems();
      const menuMsg   = await templates.askModality();
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_MODALITY,
          data: { ...sd, awaitingCourseConfirm: false, menuItems } as unknown as Prisma.InputJsonValue,
        },
      });
      await WhatsAppAdapter.send({ to: phone, body: `Sin problema. ¿Te puedo ayudar con algo más?\n\n${menuMsg}`, type: 'MENU_BACK' });
    } else {
      await WhatsAppAdapter.send({
        to: phone,
        body: `Por favor responde:\n\n1️⃣ Sí, quiero reservar mi lugar\n2️⃣ No por ahora`,
        type: 'RETRY',
      });
    }
    return;
  }

  switch (session.state) {

    // ─── NEW CONTACT ──────────────────────────
    case ConversationState.NEW_CONTACT: {
      await WhatsAppAdapter.send({ to: phone, body: templates.onboardingGreeting(), type: 'ONBOARDING_GREETING' });
      await prisma.botSession.update({ where: { phone }, data: { state: ConversationState.AWAITING_NAME } });
      break;
    }

    // ─── AWAITING NAME ────────────────────────
    case ConversationState.AWAITING_NAME: {
      const name = body.trim();
      if (name.length < 2) {
        await WhatsAppAdapter.send({ to: phone, body: '¿Puedes decirme tu nombre completo?', type: 'RETRY' });
        break;
      }
      const menuItems = await buildMenuItems();
      const menuMsg   = await templates.askModality();
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_MODALITY,
          data: { name, menuItems } as unknown as Prisma.InputJsonValue,
        },
      });
      await WhatsAppAdapter.send({ to: phone, body: menuMsg, type: 'ASK_MODALITY' });
      break;
    }

    // ─── AWAITING MODALITY ────────────────────
    case ConversationState.AWAITING_MODALITY: {
      const menuItems  = (sd.menuItems as MenuItem[]) ?? [];
      const choiceIdx  = parseInt(text) - 1;
      const chosen     = menuItems[choiceIdx];

      if (!chosen) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }

      // ── Summer course ─────────────────────
      if (chosen.type === 'course') {
        const course = await prisma.summerCourse.findUnique({
          where: { id: chosen.id },
          include: { enrollments: { where: { status: 'CONFIRMED' } } },
        });
        if (!course) { await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' }); break; }

        const spotsLeft = course.maxCapacity - course.enrollments.length;
        const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' };
        const startStr  = new Date(course.startDate).toLocaleDateString('es-MX', dateOpts);
        const endStr    = new Date(course.endDate).toLocaleDateString('es-MX', dateOpts);
        const priceStr  = `$${Number(course.price).toLocaleString('es-MX')}`;

        const courseInfo =
          `🏊 *${course.name}*\n\n` +
          `📅 *Fechas:* ${startStr} al ${endStr}\n` +
          `🕐 *Horario:* ${course.period}\n` +
          `💰 *Precio:* ${priceStr} MXN por el curso completo (4 semanas)\n` +
          `✅ *Lugares disponibles:* ${spotsLeft}\n\n` +
          `Al reservar tu cupo tienes acceso a *todas las semanas del curso* en un solo pago, ` +
          `o puedes coordinar pago semanal con administración.\n\n` +
          `¿Deseas reservar tu cupo?\n\n` +
          `1️⃣ Sí, quiero reservar mi lugar\n` +
          `2️⃣ No por ahora`;

        // Store course info + flag in session data, keep AWAITING_MODALITY state
        // so the intercept block above handles the next message
        await prisma.botSession.update({
          where: { phone },
          data: {
            state: ConversationState.AWAITING_MODALITY,
            data: {
              ...sd,
              courseId: course.id,
              courseName: course.name,
              isCourse: true,
              awaitingCourseConfirm: true,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: courseInfo, type: 'COURSE_INFO' });
        break;
      }

      // ── Regular modality / service ─────────
      const modalityEnum = chosen.type === 'modality' ? chosen.modalityEnum : null;
      let availableSchedules: { day: string; time: string; id: string }[] = [];

      if (modalityEnum) {
        const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schedules = await prisma.schedule.findMany({
          where: {
            modality: { modality: modalityEnum as any },
            isActive: true,
          },
          include: { slots: { where: { isActive: true } }, modality: true },
        });
        availableSchedules = schedules
          .filter(s => s.slots.length < (s.capacity ?? s.modality.maxCapacity))
          .map(s => ({ day: DAYS[s.dayOfWeek], time: s.startTime, id: s.id }));
      }

      if (availableSchedules.length === 0) {
        await prisma.botSession.update({
          where: { phone },
          data: {
            state: ConversationState.AWAITING_REGULATION_ACCEPT,
            data: { ...sd, selectedId: chosen.id, selectedType: chosen.type, modalityEnum: modalityEnum ?? undefined } as unknown as Prisma.InputJsonValue,
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: `Anotamos tu interés en *${chosen.name}*. Antes de continuar:`, type: 'NO_SCHEDULE' });
        await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
      } else {
        await prisma.botSession.update({
          where: { phone },
          data: {
            state: ConversationState.AWAITING_SCHEDULE,
            data: { ...sd, selectedId: chosen.id, selectedType: chosen.type, modalityEnum: modalityEnum ?? undefined, availableSchedules } as unknown as Prisma.InputJsonValue,
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: templates.askSchedule(availableSchedules), type: 'ASK_SCHEDULE' });
      }
      break;
    }

    // ─── AWAITING SCHEDULE ────────────────────
    case ConversationState.AWAITING_SCHEDULE: {
      const avail = (sd.availableSchedules as { day: string; time: string; id: string }[]) ?? [];
      const chosen = avail[parseInt(text) - 1];
      if (!chosen) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_REGULATION_ACCEPT,
          data: { ...sd, scheduleId: chosen.id } as unknown as Prisma.InputJsonValue,
        },
      });
      await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
      break;
    }

    // ─── AWAITING REGULATION ACCEPT ───────────
    case ConversationState.AWAITING_REGULATION_ACCEPT: {
      if (text !== 'ACEPTO') {
        await WhatsAppAdapter.send({
          to: phone,
          body: 'Para continuar debes aceptar el reglamento respondiendo *ACEPTO*.',
          type: 'RETRY',
        });
        break;
      }

      const name = sd.name ?? 'Alumno';

      await prisma.regulationSignature.create({
        data: { studentPhone: phone, regulationVersion: '1.0' },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modEnum = (sd.modalityEnum ?? 'FREE_ACCESS') as any;

      await prisma.student.upsert({
        where: { phone },
        update: {
          name,
          conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
          regulationAcceptedAt: new Date(),
          regulationVersion: '1.0',
          conversationData: sd as unknown as Prisma.InputJsonValue,
        },
        create: {
          phone,
          name,
          modality: modEnum,
          conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
          regulationAcceptedAt: new Date(),
          regulationVersion: '1.0',
          conversationData: sd as unknown as Prisma.InputJsonValue,
        },
      });

      if (sd.isCourse && sd.courseId) {
        const student = await prisma.student.findUnique({ where: { phone } });
        if (student) {
          await prisma.summerCourseEnrollment.create({
            data: { courseId: sd.courseId as string, studentId: student.id, status: 'PENDING' },
          }).catch(() => undefined);
          logger.info(`[BOT] Reserva curso "${sd.courseName}" — ${name} (${phone})`);
        }
      }

      await prisma.botSession.update({
        where: { phone },
        data: { state: ConversationState.PENDING_PAYMENT_CONFIRMATION },
      });

      await WhatsAppAdapter.send({
        to: phone,
        body: templates.regulationConfirmed(name),
        type: 'REGULATION_CONFIRMED',
      });
      break;
    }

    // ─── EXISTING STUDENTS ────────────────────
    case ConversationState.ACTIVE:
    case ConversationState.DELINQUENT:
    case ConversationState.SUSPENDED:
    case ConversationState.PENDING_PAYMENT_CONFIRMATION: {
      await WhatsAppAdapter.send({
        to: phone,
        body: 'Hola, recibimos tu mensaje 👋\n\nUn administrador de *OLIMPO* te atenderá en breve.',
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
