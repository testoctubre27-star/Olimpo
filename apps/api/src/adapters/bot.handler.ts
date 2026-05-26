import { ConversationState } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { templates } from './templates';
import { logger } from '../config/logger';

// ─── Build dynamic modality map from DB ───────
// Returns a map of "1" → modalityId/serviceId/courseId
// keyed by the position number shown in the menu
interface MenuItem {
  type: 'modality' | 'service' | 'course';
  id: string;
  modalityEnum?: string; // only for type=modality
  name: string;
}

async function buildMenuItems(): Promise<MenuItem[]> {
  const items: MenuItem[] = [];

  const modalities = await prisma.modalityConfig.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  for (const m of modalities) {
    items.push({ type: 'modality', id: m.id, modalityEnum: m.modality, name: m.name });
  }

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  for (const s of services) {
    items.push({ type: 'service', id: s.id, name: s.name });
  }

  const courses = await prisma.summerCourse.findMany({
    where: { status: 'ACTIVE' },
    include: { enrollments: { where: { status: 'CONFIRMED' } } },
    orderBy: { startDate: 'asc' },
  });

  for (const c of courses) {
    if (c.enrollments.length < c.maxCapacity) {
      items.push({ type: 'course', id: c.id, name: c.name });
    }
  }

  return items;
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

      // Build menu and save it in session so we can map numbers later
      const menuItems = await buildMenuItems();
      const menuMsg   = await templates.askModality();

      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_MODALITY,
          data: { name, menuItems },
        },
      });
      await WhatsAppAdapter.send({ to: phone, body: menuMsg, type: 'ASK_MODALITY' });
      break;
    }

    // ─── AWAITING MODALITY ────────────────────
    case ConversationState.AWAITING_MODALITY: {
      const sessionData  = (session.data as Record<string, unknown>) ?? {};
      const menuItems    = (sessionData.menuItems as MenuItem[]) ?? [];
      const choiceIdx    = parseInt(text) - 1;
      const chosen       = menuItems[choiceIdx];

      if (!chosen) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }

      // ── Summer course selected ────────────
      if (chosen.type === 'course') {
        const course = await prisma.summerCourse.findUnique({
          where: { id: chosen.id },
          include: { enrollments: { where: { status: 'CONFIRMED' } } },
        });
        if (!course) { await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' }); break; }

        const spotsLeft = course.maxCapacity - course.enrollments.length;
        const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' };
        const start = new Date(course.startDate).toLocaleDateString('es-MX', dateOpts);
        const end   = new Date(course.endDate).toLocaleDateString('es-MX', dateOpts);
        const price = `$${Number(course.price).toLocaleString('es-MX')}`;

        const courseInfo =
          `🏊 *${course.name}*

` +
          `📅 *Fechas:* ${start} al ${end}
` +
          `🕐 *Horario:* ${course.period}
` +
          `💰 *Precio:* ${price} MXN por el curso completo
` +
          `✅ *Lugares disponibles:* ${spotsLeft}

` +
          `Al apartar tu cupo, reservas tu lugar para *las 4 semanas completas* del curso.

` +
          `Puedes pagar el curso completo en un solo pago o semanalmente coordinando con administración.

` +
          `¿Deseas reservar tu cupo?

` +
          `1️⃣ Sí, quiero reservar mi lugar
` +
          `2️⃣ No por ahora`;

        await prisma.botSession.update({
          where: { phone },
          data: {
            state: 'AWAITING_COURSE_CONFIRM' as never,
            data: { ...sessionData, courseId: course.id, courseName: course.name, isCourse: true },
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: courseInfo, type: 'COURSE_INFO' });
        break;
      }

      // ── Modality or service selected ──────
      const modalityEnum = chosen.type === 'modality' ? chosen.modalityEnum : null;

      // Fetch schedules only for enum-based modalities
      let availableSchedules: { day: string; time: string; id: string }[] = [];
      if (modalityEnum) {
        const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const schedules = await prisma.schedule.findMany({
          where: { modality: { modality: modalityEnum as never }, isActive: true },
          include: { slots: { where: { isActive: true } }, modality: true },
        });
        availableSchedules = schedules
          .filter(s => s.slots.length < (s.capacity ?? s.modality.maxCapacity))
          .map(s => ({ day: DAYS[s.dayOfWeek], time: s.startTime, id: s.id }));
      }

      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_SCHEDULE,
          data: {
            ...sessionData,
            selectedId:         chosen.id,
            selectedType:       chosen.type,
            modalityEnum:       modalityEnum ?? null,
            availableSchedules,
          },
        },
      });

      if (availableSchedules.length === 0) {
        // No schedules — skip to regulation
        await prisma.botSession.update({
          where: { phone },
          data: { state: ConversationState.AWAITING_REGULATION_ACCEPT },
        });
        await WhatsAppAdapter.send({
          to: phone,
          body: `Anotamos tu interés en *${chosen.name}*.\n\nAntes de continuar, por favor lee nuestro reglamento:`,
          type: 'NO_SCHEDULE',
        });
        await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
      } else {
        await WhatsAppAdapter.send({ to: phone, body: templates.askSchedule(availableSchedules), type: 'ASK_SCHEDULE' });
      }
      break;
    }

    // ─── AWAITING SCHEDULE ────────────────────
    case ConversationState.AWAITING_SCHEDULE: {
      const sessionData      = (session.data as Record<string, unknown>) ?? {};
      const availableSchedules = (sessionData.availableSchedules as { day: string; time: string; id: string }[]) ?? [];
      const idx              = parseInt(text) - 1;
      const chosen           = availableSchedules[idx];

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

      const sessionData = (session.data as Record<string, string & { isCourse?: boolean }>) ?? {};
      const name = (sessionData as Record<string, string>).name ?? 'Alumno';

      await prisma.regulationSignature.create({
        data: { studentPhone: phone, regulationVersion: '1.0' },
      });

      // Upsert student
      await prisma.student.upsert({
        where: { phone },
        update: {
          name,
          conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
          regulationAcceptedAt: new Date(),
          regulationVersion: '1.0',
          conversationData: sessionData as never,
        },
        create: {
          phone,
          name,
          modality: ((sessionData as Record<string, string>).modalityEnum ?? 'FREE_ACCESS') as never,
          conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
          regulationAcceptedAt: new Date(),
          regulationVersion: '1.0',
          conversationData: sessionData as never,
        },
      });

      // If it was a summer course, register the enrollment
      const sd = sessionData as Record<string, unknown>;
      if (sd.isCourse && sd.courseId) {
        const student = await prisma.student.findUnique({ where: { phone } });
        if (student) {
          await prisma.summerCourseEnrollment.create({
            data: {
              courseId:  sd.courseId as string,
              studentId: student.id,
              status:    'PENDING',
            },
          }).catch(() => undefined); // ignore if already enrolled

          // Notify admin via log
          logger.info(`[BOT] Nuevo interés en curso de verano "${sd.courseName}" — alumno: ${name} (${phone})`);
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

    // ─── AWAITING COURSE CONFIRMATION ────────
    case 'AWAITING_COURSE_CONFIRM' as never: {
      const sessionData = (session.data as Record<string, unknown>) ?? {};

      if (text === '1' || text.includes('SÍ') || text.includes('SI') || text === 'QUIERO') {
        // Move to regulation
        await prisma.botSession.update({
          where: { phone },
          data: { state: ConversationState.AWAITING_REGULATION_ACCEPT },
        });
        await WhatsAppAdapter.send({
          to: phone,
          body: `¡Perfecto! 🎉 Antes de confirmar tu reserva, necesitamos que leas y aceptes nuestro reglamento:`,
          type: 'COURSE_CONFIRM',
        });
        await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
      } else if (text === '2' || text.includes('NO')) {
        // Cancel — go back to menu
        const menuItems = await buildMenuItems();
        const menuMsg   = await templates.askModality();
        await prisma.botSession.update({
          where: { phone },
          data: {
            state: ConversationState.AWAITING_MODALITY,
            data: { ...(sessionData as object), menuItems },
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: `Sin problema. ¿Hay algo más en lo que te podamos ayudar?

${menuMsg}`, type: 'MENU_BACK' });
      } else {
        await WhatsAppAdapter.send({
          to: phone,
          body: `Por favor responde:

1️⃣ Sí, quiero reservar mi lugar
2️⃣ No por ahora`,
          type: 'RETRY',
        });
      }
      break;
    }

    // ─── ACTIVE / EXISTING STUDENTS ───────────
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
