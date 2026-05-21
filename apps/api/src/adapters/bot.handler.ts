import { ConversationState, Modality } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { templates } from './templates';
import { logger } from '../config/logger';

// Maps user text input → Modality enum
const MODALITY_MAP: Record<string, Modality> = {
  '1': 'BABY_PHASE1',
  '2': 'BABY_PHASE2',
  '3': 'BABY_PHASE3',
  '4': 'GROUP_CHILD',
  '5': 'GROUP_ADULT',
  '6': 'FREE_ACCESS',
  '7': 'AQUA_THERAPY',
};

// Fetches active summer courses for bot menu
async function getActiveCourses() {
  const courses = await prisma.summerCourse.findMany({
    where: { status: 'ACTIVE' },
    include: {
      enrollments: { where: { status: 'CONFIRMED' } },
      teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
    },
    orderBy: { startDate: 'asc' },
  });

  return courses.filter(c => c.enrollments.length < c.maxCapacity);
}

export async function handleIncomingMessage(phone: string, body: string): Promise<void> {
  const text = body.trim().toUpperCase();

  let session = await prisma.botSession.findUnique({ where: { phone } });
  if (!session) {
    session = await prisma.botSession.create({
      data: { phone, state: ConversationState.NEW_CONTACT },
    });
  }

  logger.info('Bot incoming', { phone, state: session.state, text: body.slice(0, 50) });

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
        await WhatsAppAdapter.send({ to: phone, body: '¿Puedes decirme tu nombre completo? 😊', type: 'RETRY' });
        break;
      }
      await prisma.botSession.update({
        where: { phone },
        data: { state: ConversationState.AWAITING_MODALITY, data: { name } },
      });
      await WhatsAppAdapter.send({ to: phone, body: await templates.askModality(), type: 'ASK_MODALITY' });
      break;
    }

    case ConversationState.AWAITING_MODALITY: {
      const sessionData = (session.data as Record<string, string>) ?? {};
      const activeCourses = await getActiveCourses();

      // Check if user selected a summer course
      const courseIndex = parseInt(text) - 8; // Options 1-7 are modalities, 8+ are courses
      if (activeCourses.length > 0 && courseIndex >= 0 && courseIndex < activeCourses.length) {
        const course = activeCourses[courseIndex];

        await prisma.botSession.update({
          where: { phone },
          data: {
            state: 'AWAITING_REGULATION_ACCEPT' as ConversationState,
            data: { ...sessionData, courseId: course.id, isSummerCourse: 'true' },
          },
        });

        const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
        const teachers = course.teachers.map(t => t.teacher.user.name).join(', ');
        const infoMsg =
          `¡Excelente elección! 🏊\n\n` +
          `*${course.name}*\n\n` +
          `${course.description ? course.description + '\n\n' : ''}` +
          `📅 Inicio: ${new Date(course.startDate).toLocaleDateString('es-MX', dateOpts)}\n` +
          `📅 Fin: ${new Date(course.endDate).toLocaleDateString('es-MX', dateOpts)}\n` +
          `⏰ Periodo: ${course.period}\n` +
          `${course.schedule ? `🕐 Horario: ${course.schedule}\n` : ''}` +
          `👨‍🏫 Instructor(es): ${teachers || 'Por asignar'}\n` +
          `💰 Costo total: $${Number(course.price).toLocaleString('es-MX')} MXN\n` +
          `📊 Lugares disponibles: ${course.maxCapacity - course.enrollments.length}\n\n` +
          `Para continuar, por favor lee y acepta nuestro reglamento:`;

        await WhatsAppAdapter.send({ to: phone, body: infoMsg, type: 'COURSE_INFO' });
        await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
        break;
      }

      // Regular modality selection
      const modality = MODALITY_MAP[text];
      if (!modality) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }

      await prisma.botSession.update({
        where: { phone },
        data: { state: ConversationState.AWAITING_SCHEDULE, data: { ...sessionData, modality } },
      });

      const schedules = await prisma.schedule.findMany({
        where: { modality: { modality }, isActive: true },
        include: { slots: { where: { isActive: true } }, modality: true },
      });

      const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const available = schedules
        .filter(s => s.slots.length < (s.capacity ?? s.modality.maxCapacity))
        .map(s => ({ day: DAYS[s.dayOfWeek], time: s.startTime, id: s.id }));

      if (available.length === 0) {
        await WhatsAppAdapter.send({
          to: phone,
          body: `Lo sentimos, no hay horarios disponibles para esa modalidad en este momento.\n\nTe anotaremos en lista de espera y te avisaremos cuando se libere un lugar. 🏊`,
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
        data: { state: ConversationState.AWAITING_REGULATION_ACCEPT, data: { ...sessionData, scheduleId: chosen.id } },
      });

      await WhatsAppAdapter.send({ to: phone, body: templates.sendRegulation(), type: 'REGULATION' });
      break;
    }

    case ConversationState.AWAITING_REGULATION_ACCEPT: {
      if (text !== 'ACEPTO') {
        await WhatsAppAdapter.send({
          to: phone,
          body: 'Para continuar debes aceptar el reglamento respondiendo *ACEPTO*. 📋',
          type: 'RETRY',
        });
        break;
      }

      const sessionData = (session.data as Record<string, string>) ?? {};
      const isSummerCourse = sessionData.isSummerCourse === 'true';

      await prisma.regulationSignature.create({
        data: { studentPhone: phone, regulationVersion: '1.0' },
      });

      if (isSummerCourse) {
        // Create summer course enrollment
        const course = await prisma.summerCourse.findUnique({ where: { id: sessionData.courseId } });

        if (course) {
          await prisma.summerCourseEnrollment.upsert({
            where: { courseId_studentPhone: { courseId: course.id, studentPhone: phone } },
            update: { status: 'PENDING', studentName: sessionData.name },
            create: {
              courseId:     course.id,
              studentPhone: phone,
              studentName:  sessionData.name,
              status:       'PENDING',
            },
          });

          await prisma.botSession.update({
            where: { phone },
            data: { state: ConversationState.PENDING_PAYMENT_CONFIRMATION },
          });

          await WhatsAppAdapter.send({
            to: phone,
            body:
              `¡Gracias, ${sessionData.name}! ✅ Tu interés en el *${course.name}* ha sido registrado.\n\n` +
              `Un administrador revisará tu solicitud y te contactará para confirmar tu inscripción y el pago de $${Number(course.price).toLocaleString('es-MX')} MXN.\n\n` +
              `¡Gracias por elegir *OLIMPO*! 🏊`,
            type: 'COURSE_INTEREST',
          });
        }
      } else {
        // Regular student enrollment
        const modality = sessionData.modality as Modality;

        await prisma.student.upsert({
          where: { phone },
          update: {
            name: sessionData.name,
            modality,
            conversationState: ConversationState.PENDING_PAYMENT_CONFIRMATION,
            regulationAcceptedAt: new Date(),
            regulationVersion: '1.0',
            conversationData: sessionData,
          },
          create: {
            phone,
            name: sessionData.name,
            modality,
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
      }
      break;
    }

    case ConversationState.ACTIVE:
    case ConversationState.DELINQUENT:
    case ConversationState.SUSPENDED:
    case ConversationState.PENDING_PAYMENT_CONFIRMATION: {
      await WhatsAppAdapter.send({
        to: phone,
        body: `Hola, recibimos tu mensaje. 👋\n\nUn administrador de *OLIMPO* te atenderá en breve.`,
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
