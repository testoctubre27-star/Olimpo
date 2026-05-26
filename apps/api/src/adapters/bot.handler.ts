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
      // Require at least 3 chars and at least one letter (avoids "???" or "123")
      const hasLetters = /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(name);
      if (name.length < 3 || !hasLetters) {
        await WhatsAppAdapter.send({
          to: phone,
          body: 'Por favor dime tu *nombre completo* para continuar (ej: Juan García López).',
          type: 'RETRY',
        });
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
      let menuItems = (sd.menuItems as MenuItem[] | undefined);

      // If menuItems is missing or empty, regenerate menu
      // This fixes sessions that got stuck before courses were active
      if (!menuItems || menuItems.length === 0) {
        menuItems = await buildMenuItems();
        const menuMsg = await templates.askModality();
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, menuItems } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        await WhatsAppAdapter.send({ to: phone, body: menuMsg, type: 'ASK_MODALITY' });
        break;
      }

      const choiceIdx = parseInt(text) - 1;
      const chosen    = menuItems[choiceIdx];

      if (!chosen) {
        // Also show menu again if invalid choice
        const menuMsg = await templates.askModality();
        await WhatsAppAdapter.send({
          to: phone,
          body: `Por favor elige una opción del menú respondiendo con su número:\n\n${menuMsg}`,
          type: 'RETRY',
        });
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
          where: { modality: { modality: modalityEnum as any }, isActive: true },
          include: {
            slots:      { where: { isActive: true } },
            modality:   true,
            pairedWith: { include: { slots: { where: { isActive: true } } } },
          },
        });

        const seenPairs = new Set<string>();

        for (const s of schedules) {
          const cap         = s.capacity ?? s.modality.maxCapacity;
          const hasCapacity = s.slots.length < cap;

          if (s.pairedWithId && (s as any).pairedWith) {
            // Paired — only show once, under the lower dayOfWeek
            const pairKey = [s.id, s.pairedWithId].sort().join('-');
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const paired    = (s as any).pairedWith;
            const pairedCap = paired.capacity ?? cap;
            if (!hasCapacity || paired.slots.length >= pairedCap) continue;

            // Show both days combined e.g. "Lun y Mié"
            const days = [s.dayOfWeek, paired.dayOfWeek].sort((a, b) => a - b);
            availableSchedules.push({
              day:          `${DAYS[days[0]]} y ${DAYS[days[1]]}`,
              time:         s.startTime,
              id:           s.id,
              pairedWithId: s.pairedWithId,
            } as any);
          } else if (!s.pairedWithId) {
            if (!hasCapacity) continue;
            availableSchedules.push({ day: DAYS[s.dayOfWeek], time: s.startTime, id: s.id });
          }
        }
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
      const avail = (sd.availableSchedules as { day: string; time: string; id: string; pairedWithId?: string }[]) ?? [];
      const chosen = avail[parseInt(text) - 1];
      if (!chosen) {
        await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' });
        break;
      }
      await prisma.botSession.update({
        where: { phone },
        data: {
          state: ConversationState.AWAITING_REGULATION_ACCEPT,
          data: { ...sd, scheduleId: chosen.id, pairedScheduleId: (chosen as any).pairedWithId ?? null } as unknown as Prisma.InputJsonValue,
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
            data: {
              courseId:    sd.courseId as string,
              studentId:   student.id,
              studentPhone: phone,
              studentName:  name,
              status:      'PENDING',
            },
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
        body: templates.regulationConfirmed(name, !!(sd.isCourse)),
        type: 'REGULATION_CONFIRMED',
      });
      break;
    }

    // ─── EXISTING STUDENTS ────────────────────
    case ConversationState.ACTIVE:
    case ConversationState.DELINQUENT:
    case ConversationState.SUSPENDED:
    case ConversationState.PENDING_PAYMENT_CONFIRMATION: {
      // Find student record
      const student = await prisma.student.findUnique({
        where: { phone },
        include: {
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
          scheduleSlots: {
            where: { isActive: true },
            include: { schedule: { include: { modality: true } } },
          },
          teacher: { include: { user: { select: { name: true } } } },
        },
      });
      const studentName = student?.name ?? 'Alumno';

      // ── Keywords that always work ───────────
      if (text === 'MENÚ' || text === 'MENU' || text === 'HOLA' || text === 'INICIO') {
        // Count enrolled people under this phone
        const enrolledUnderPhone = await prisma.student.count({ where: { phone } });
        await WhatsAppAdapter.send({ to: phone, body: templates.activeMenu(studentName, enrolledUnderPhone), type: 'ACTIVE_MENU' });
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'CHOOSING' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        break;
      }

      // ── Handle active menu navigation ───────
      const menuStep = sd.activeMenuStep as string | undefined;

      // Waiting for menu choice
      if (!menuStep || menuStep === 'MAIN') {
        const enrolledUnderPhone = await prisma.student.count({ where: { phone } });
        await WhatsAppAdapter.send({ to: phone, body: templates.activeMenu(studentName, enrolledUnderPhone), type: 'ACTIVE_MENU' });
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'CHOOSING' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        break;
      }

      if (menuStep === 'CHOOSING') {
        switch (text) {
          case '1': {
            // Account status
            const slot    = student?.scheduleSlots?.[0];
            const DAYS    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            const schedule = slot
              ? `${DAYS[slot.schedule.dayOfWeek]} ${slot.schedule.startTime}–${slot.schedule.endTime}`
              : 'Sin horario asignado';
            const lastPay  = student?.payments?.[0];
            const lastPayStr = lastPay
              ? `${new Date(lastPay.createdAt).toLocaleDateString('es-MX')} — $${Number(lastPay.amount).toLocaleString('es-MX')}`
              : null;
            const MODALITY_NAMES: Record<string, string> = {
              BABY_PHASE1: 'Natación Bebés Fase 1', BABY_PHASE2: 'Natación Bebés Fase 2',
              BABY_PHASE3: 'Natación Bebés Fase 3', GROUP_CHILD: 'Natación Grupal Infantil',
              GROUP_ADULT: 'Natación Adultos Grupal', FREE_ACCESS: 'Acceso Libre',
              AQUA_THERAPY: 'Terapia Acuática', PERSONAL_CHILD: 'Personalizado Infantil',
            };
            await WhatsAppAdapter.send({
              to: phone,
              body: templates.accountStatus({
                name:       studentName,
                modality:   MODALITY_NAMES[student?.modality ?? ''] ?? student?.modality ?? '—',
                schedule,
                teacher:    student?.teacher?.user?.name ?? 'Por asignar',
                lastPayment: lastPayStr,
                status:     session.state,
                delinquent: session.state === ConversationState.DELINQUENT,
              }),
              type: 'ACCOUNT_STATUS',
            });
            await prisma.botSession.update({
              where: { phone },
              data: { data: { ...sd, activeMenuStep: 'MAIN' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
            });
            break;
          }
          case '2': {
            // Report payment
            await WhatsAppAdapter.send({ to: phone, body: templates.reportPaymentPrompt(), type: 'REPORT_PAYMENT_PROMPT' });
            await prisma.botSession.update({
              where: { phone },
              data: { data: { ...sd, activeMenuStep: 'AWAITING_PAYMENT_REPORT' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
            });
            break;
          }
          case '3': {
            // Request schedule change
            await WhatsAppAdapter.send({ to: phone, body: templates.changeSchedulePrompt(), type: 'CHANGE_SCHEDULE_PROMPT' });
            await prisma.botSession.update({
              where: { phone },
              data: { data: { ...sd, activeMenuStep: 'AWAITING_SCHEDULE_REQUEST' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
            });
            break;
          }
          case '4': {
            // Handoff to admin
            await WhatsAppAdapter.send({
              to: phone,
              body: `Entendido, *${studentName}*. Un administrador de *OLIMPO* te atenderá a la brevedad. 🙌`,
              type: 'HANDOFF',
            });
            await prisma.botSession.update({
              where: { phone },
              data: { data: { ...sd, activeMenuStep: 'MAIN' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
            });
            break;
          }
          case '5': {
            // Enroll another person
            const enrolledCount = await prisma.student.count({ where: { phone } });
            if (enrolledCount >= 5) {
              await WhatsAppAdapter.send({
                to: phone,
                body: `Ya tienes el máximo de *5 personas* inscritas bajo este número. Si necesitas hacer algún cambio, escribe *MENÚ* para ver tus opciones. 🙏`,
                type: 'MAX_ENROLLED',
              });
              await prisma.botSession.update({
                where: { phone },
                data: { data: { ...sd, activeMenuStep: 'MAIN' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
              });
            } else {
              await WhatsAppAdapter.send({
                to: phone,
                body:
                  `¡Perfecto! Vamos a inscribir a otra persona bajo este número. 📝\n\n` +
                  `Por favor dime el *nombre completo* de la persona que deseas inscribir.`,
                type: 'ENROLL_EXTRA_PROMPT',
              });
              await prisma.botSession.update({
                where: { phone },
                data: { data: { ...sd, activeMenuStep: 'ENROLL_EXTRA_NAME' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
              });
            }
            break;
          }
          default: {
            const enrolledUnderPhone2 = await prisma.student.count({ where: { phone } });
            await WhatsAppAdapter.send({ to: phone, body: templates.activeMenu(studentName, enrolledUnderPhone2), type: 'ACTIVE_MENU' });
            break;
          }
        }
        break;
      }

      // Waiting for payment report details
      if (menuStep === 'AWAITING_PAYMENT_REPORT') {
        // Log payment report in notification log so admin sees it
        await prisma.notificationLog.create({
          data: {
            phone,
            studentId: student?.id,
            type:      'PAYMENT_REPORT',
            message:   `Reporte de pago de ${studentName}: ${body}`,
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: templates.paymentReportReceived(studentName), type: 'PAYMENT_REPORT_RECEIVED' });
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'MAIN' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        break;
      }

      // Waiting for schedule change request
      if (menuStep === 'AWAITING_SCHEDULE_REQUEST') {
        await prisma.notificationLog.create({
          data: {
            phone,
            studentId: student?.id,
            type:      'SCHEDULE_CHANGE_REQUEST',
            message:   `Solicitud de cambio de horario de ${studentName}: ${body}`,
          },
        });
        await WhatsAppAdapter.send({ to: phone, body: templates.requestReceived(studentName), type: 'REQUEST_RECEIVED' });
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'MAIN' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        break;
      }

      // Collecting name for extra enrollment
      if (menuStep === 'ENROLL_EXTRA_NAME') {
        const extraName = body.trim();
        const hasLetters = /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(extraName);
        if (extraName.length < 3 || !hasLetters) {
          await WhatsAppAdapter.send({
            to: phone,
            body: 'Por favor dime el *nombre completo* de la persona a inscribir (ej: Ana García López).',
            type: 'RETRY',
          });
          break;
        }
        // Build menu for new person
        const newMenuItems = await buildMenuItems();
        const menuMsg      = await templates.askModality();
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'ENROLL_EXTRA_MODALITY', extraName, menuItems: newMenuItems } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        await WhatsAppAdapter.send({ to: phone, body: menuMsg, type: 'ENROLL_EXTRA_MODALITY' });
        break;
      }

      // Collecting modality for extra enrollment
      if (menuStep === 'ENROLL_EXTRA_MODALITY') {
        const extraMenuItems = (sd.menuItems as MenuItem[] | undefined) ?? [];
        const choiceIdx      = parseInt(text) - 1;
        const chosen         = extraMenuItems[choiceIdx];

        if (!chosen) {
          const menuMsg = await templates.askModality();
          await WhatsAppAdapter.send({
            to: phone,
            body: `Por favor elige una opción válida:\n\n${menuMsg}`,
            type: 'RETRY',
          });
          break;
        }

        const extraName = sd.extraName as string;

        // Create the extra student linked to same phone
        const existingCount = await prisma.student.count({ where: { phone } });
        if (existingCount >= 5) {
          await WhatsAppAdapter.send({
            to: phone,
            body: `Ya tienes el máximo de *5 personas* inscritas bajo este número. No es posible agregar más.`,
            type: 'MAX_ENROLLED',
          });
          await prisma.botSession.update({
            where: { phone },
            data: { data: { ...sd, activeMenuStep: 'MAIN', extraName: undefined, menuItems: undefined } as unknown as import('@prisma/client').Prisma.InputJsonValue },
          });
          break;
        }

        // For courses: show course info and ask confirm
        if (chosen.type === 'course') {
          const course = await prisma.summerCourse.findUnique({
            where: { id: chosen.id },
            include: { enrollments: { where: { status: 'CONFIRMED' } } },
          });
          if (!course) { await WhatsAppAdapter.send({ to: phone, body: templates.unknown(), type: 'RETRY' }); break; }

          const spotsLeft = course.maxCapacity - course.enrollments.length;
          const priceStr  = `$${Number(course.price).toLocaleString('es-MX')}`;
          const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' };
          const startStr  = new Date(course.startDate).toLocaleDateString('es-MX', dateOpts);
          const endStr    = new Date(course.endDate).toLocaleDateString('es-MX', dateOpts);

          await prisma.botSession.update({
            where: { phone },
            data: { data: { ...sd, activeMenuStep: 'ENROLL_EXTRA_COURSE_CONFIRM', extraCourseId: chosen.id, extraCourseName: chosen.name } as unknown as import('@prisma/client').Prisma.InputJsonValue },
          });
          await WhatsAppAdapter.send({
            to: phone,
            body:
              `🏊 *${course.name}* para *${extraName}*\n\n` +
              `📅 ${startStr} al ${endStr} · ${course.period}\n` +
              `💰 ${priceStr} por el curso completo\n` +
              `✅ Lugares disponibles: ${spotsLeft}\n\n` +
              `¿Confirmas la reserva?\n1️⃣ Sí\n2️⃣ No`,
            type: 'ENROLL_EXTRA_COURSE_INFO',
          });
          break;
        }

        // For regular modality: notify admin via log — don't create student record
        // because phone is @unique and multiple people share the same number.
        // Admin registers them manually from the panel.
        await prisma.notificationLog.create({
          data: {
            phone,
            type:    'EXTRA_ENROLLMENT',
            message: `Solicitud de inscripción adicional: *${extraName}* en *${chosen.name}* (${chosen.modalityEnum ?? chosen.type}) — solicitado por ${studentName} (${phone}). Registrar manualmente desde el panel de administración.`,
          },
        });

        await WhatsAppAdapter.send({
          to: phone,
          body:
            `✅ ¡Registramos el interés de *${extraName}* en *${chosen.name}*!\n\n` +
            `Un administrador los contactará para confirmar el pago, asignar horario y completar el registro. 🏊\n\n` +
            `Escribe *MENÚ* si necesitas algo más.`,
          type: 'ENROLL_EXTRA_DONE',
        });
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'MAIN', extraName: undefined, menuItems: undefined } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        break;
      }


      // Confirm extra enrollment in a course
      if (menuStep === 'ENROLL_EXTRA_COURSE_CONFIRM') {
        const extraName    = sd.extraName as string;
        const extraCourseId = sd.extraCourseId as string;
        const extraCourseName = sd.extraCourseName as string;

        if (text === '1' || text === 'SÍ' || text === 'SI') {
          // Notify admin to register manually — can't create student with duplicate phone
          await prisma.notificationLog.create({
            data: { phone, type: 'EXTRA_ENROLLMENT', message: `Solicitud de inscripción adicional al curso "${extraCourseName}": *${extraName}* — solicitado por ${studentName} (${phone}). Registrar manualmente desde el panel. Recordar solicitar 50% de anticipo.` },
          });
          await WhatsAppAdapter.send({
            to: phone,
            body:
              `✅ ¡Reservamos el lugar de *${extraName}* en *${extraCourseName}*!\n\n` +
              `Para apartar el lugar se requiere el *50% del costo total* como anticipo.\n` +
              `Un administrador los contactará para coordinar el pago. 🏊\n\n` +
              `Escribe *MENÚ* si necesitas algo más.`,
            type: 'ENROLL_EXTRA_DONE',
          });
        } else {
          await WhatsAppAdapter.send({ to: phone, body: `Entendido, cancelamos la inscripción de *${extraName}*. Escribe *MENÚ* si necesitas algo más.`, type: 'ENROLL_EXTRA_CANCELLED' });
        }
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'MAIN', extraName: undefined, extraCourseId: undefined, extraCourseName: undefined, menuItems: undefined } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
        break;
      }

      // Default — show menu
      {
        const enrolledUnderPhone = await prisma.student.count({ where: { phone } });
        await WhatsAppAdapter.send({ to: phone, body: templates.activeMenu(studentName, enrolledUnderPhone), type: 'ACTIVE_MENU' });
        await prisma.botSession.update({
          where: { phone },
          data: { data: { ...sd, activeMenuStep: 'CHOOSING' } as unknown as import('@prisma/client').Prisma.InputJsonValue },
        });
      }
      break;
    }

    default: {
      logger.warn('Unknown bot state', { phone, state: session.state });
      // Reset stuck sessions
      await prisma.botSession.update({
        where: { phone },
        data: { state: ConversationState.NEW_CONTACT, data: {} as unknown as import('@prisma/client').Prisma.InputJsonValue },
      });
      await WhatsAppAdapter.send({ to: phone, body: templates.onboardingGreeting(), type: 'RESET' });
      break;
    }
  }
}
