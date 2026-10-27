import { ConversationState, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { logger } from '../config/logger';

// ─── Send helper ──────────────────────────────
async function send(phone: string, body: string, type = 'BOT') {
  await WhatsAppAdapter.send({ to: phone, body, type });
}

// ─── Session helpers ──────────────────────────
function sd(session: { data: unknown }) {
  return (session.data ?? {}) as Record<string, any>;
}

// ─── Number emojis 1-9 ─────────────────────────
const N = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];

// ─── Day labels ───────────────────────────────
const DAY_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ─── Greeting / restart keywords ──────────────
const GREETINGS = new Set([
  'HOLA', 'HOLA!', 'MENU', 'MENÚ', 'INICIO', 'HELLO', 'HI',
  'BUENAS', 'BUENOS DÍAS', 'BUENAS TARDES', 'BUENAS NOCHES',
]);

// ─── Name prompt ──────────────────────────────
const NAME_PROMPT = `👤 *Nombre del alumno(a)*\n\nPor favor escríbeme el *nombre completo* del alumno(a) que tomará la clase.\n\n_Escribe *menú* en cualquier momento para volver al inicio_ 👋`;

// ─── Helpers ──────────────────────────────────
async function getStudentModalityFromSchedule(scheduleId: string): Promise<{ modality: string; teacherId: string | null } | null> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { modalities: { include: { modality: true } }, teacher: { include: { user: true } } },
  });
  if (!schedule) return null;
  const modalityEnum = schedule.modalities[0]?.modality?.modality;
  if (!modalityEnum) return null;
  return { modality: modalityEnum, teacherId: schedule.teacherId };
}

async function createStudentAndSlot(phone: string, name: string, scheduleId: string, modalityEnum: string): Promise<{ id: string } | null> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { slots: { where: { isActive: true } } },
  });
  if (!schedule || schedule.slots.length >= schedule.capacity) return null;

  const student = await prisma.student.upsert({
    where: { phone },
    update: { name, modality: modalityEnum as never },
    create: {
      phone,
      name,
      modality: modalityEnum as never,
      status: 'PENDING_PAYMENT' as any,
      conversationState: ConversationState.AWAITING_REGULATION_ACCEPT as any,
    },
  });

  const existing = await prisma.scheduleSlot.findUnique({
    where: { scheduleId_studentId: { scheduleId, studentId: student.id } },
  });
  if (!existing?.isActive) {
    await prisma.scheduleSlot.upsert({
      where: { scheduleId_studentId: { scheduleId, studentId: student.id } },
      create: { scheduleId, studentId: student.id, teacherId: schedule.teacherId ?? undefined, isActive: true },
      update: { isActive: true, releasedAt: null, teacherId: schedule.teacherId ?? undefined },
    });
  }

  return { id: student.id };
}

async function getAvailableSchedules(
  teacherEmails: string[],
  modalityEnums: string[],
): Promise<{ id: string; label: string; teacherName: string }[]> {
  const teachers = await prisma.teacher.findMany({
    where: { user: { email: { in: teacherEmails } }, isActive: true },
    include: { user: true },
  });
  if (teachers.length === 0) return [];

  const teacherIds = teachers.map(t => t.id);
  const nameById: Record<string, string> = Object.fromEntries(teachers.map(t => [t.id, t.user.name]));

  const schedules = await prisma.schedule.findMany({
    where: {
      teacherId: { in: teacherIds },
      isActive: true,
      OR: [
        { modalities: { some: { modality: { modality: { in: modalityEnums as never[] } } } } },
      ],
    },
    include: {
      modalities: { include: { modality: true } },
      slots: { where: { isActive: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return schedules
    .filter(s => s.slots.length < s.capacity)
    .map(s => {
      const modName = s.modalities?.[0]?.modality?.name ?? 'Clase';
      const teacherName = s.teacherId ? (nameById[s.teacherId] ?? 'Por asignar') : 'Por asignar';
      return {
        id: s.id,
        label: `${DAY_ES[s.dayOfWeek]} ${s.startTime}–${s.endTime} · ${modName}`,
        teacherName,
      };
    });
}

// ─── MAIN MENU ────────────────────────────────
const MAIN_MENU = `🏊‍♂️ ¡Bienvenido a *OLIMPO Centro de Terapia y Deporte*! 🌊

¿En qué te podemos ayudar hoy? 👇

${N[0]} 👶🏼 *Clase bebés: 5 meses - 5 años (Clase muestra)* — Conoce nuestras instalaciones
${N[1]} 🌞 *Cursos de verano* — Inscríbete ahora
${N[2]} 👦🏻 *Clase grupal: 5 años en adelante* — Información
${N[3]} 🙋🏻 *Clase grupal: Adultos* — Información
${N[4]} 💳 *Realizar un pago* — Datos bancarios
${N[5]} ❌ *Cancelar / Cambiar cita* — Gestionar mi lugar

_Responde con el número de tu elección_ 👆`;

// ─── INFO MESSAGES ────────────────────────────
const CLASE_NINOS_MSG = `👦🏻 *CLASE GRUPAL: 5 AÑOS EN ADELANTE* 🏊‍♂️

¡Aprende a nadar en un ambiente grupal y divertido! 🌊

━━━━━━━━━━━━━━━━━━━
⚠️ *Qué debe traer:*
   🧢 Gorro
   🥽 Googles
   🩱 Traje de baño / Ropa de licra

━━━━━━━━━━━━━━━━━━━
Para más información o agendar tu lugar, comunícate directamente con nosotros. 🙏

_Escribe *hola* para volver al menú principal_ 👋`;

const CLASE_ADULTOS_MSG = `🙋🏻 *CLASE GRUPAL: ADULTOS* 🏊‍♀️

¡Aprende o perfecciona tu técnica de natación! 🌊

━━━━━━━━━━━━━━━━━━━
⚠️ *Qué debes traer:*
   🧢 Gorro
   🥽 Googles
   🩱 Traje de baño / Ropa de licra

━━━━━━━━━━━━━━━━━━━
Para más información o agendar tu lugar, comunícate directamente con nosotros. 🙏

_Escribe *hola* para volver al menú principal_ 👋`;

const PAYMENT_MSG = `💳 *INFORMACIÓN PARA REALIZAR TU PAGO* 💰

Puedes transferirnos directamente con estos datos:

🏦 *CLABE:* 722969010560005718
👤 *Beneficiario:* Alejandra Flores Prior
🏛️ *Institución:* Mercado Pago W

━━━━━━━━━━━━━━━━━━━
📸 *Una vez realizado el pago*, envía tu comprobante y un administrador confirmará tu lugar a la brevedad.

¡Gracias por confiar en *OLIMPO*! 🙏🏊‍♂️

_Escribe *hola* para volver al menú principal_ 👋`;

const CANCEL_MSG = `❌ *CANCELAR O CAMBIAR CITA* 📅

Para gestionar tu cita comunícate directamente con nosotros:

👩‍💼 *Administración OLIMPO*
📞 Un asesor te atenderá a la brevedad

━━━━━━━━━━━━━━━━━━━
ℹ️ _Recuerda que los cambios de horario están sujetos a disponibilidad._

_Escribe *hola* para volver al menú principal_ 👋`;

const BABY_CLASS_MSG = `👶🏼 *CLASE MUESTRA - BEBÉS 5 MESES A 5 AÑOS* 🛁

¡Conoce nuestras instalaciones y el ambiente acuático para tu pequeño! 💙

━━━━━━━━━━━━━━━━━━━
📍 Te invitamos a agendar una *clase muestra* sin costo.
📞 Un asesor te contactará para programar tu cita.

_Escribe *hola* para volver al menú principal_ 👋`;

const REGULATION_MSG = `📋 *REGLAMENTO OLIMPO*\n\nAl inscribirte aceptas el reglamento interno de la Academia de Natación OLIMPO.\n\nResponde *ACEPTO* para aceptar el reglamento y continuar con tu inscripción.\n\n_Escribe *NO ACEPTO* si deseas cancelar_`;

// ─── HANDLER ─────────────────────────────────
export async function handleIncomingMessage(phone: string, body: string): Promise<void> {
  const text = body.trim();
  const upper = text.toUpperCase();

  let session = await prisma.botSession.findUnique({ where: { phone } });
  if (!session) {
    session = await prisma.botSession.create({
      data: { phone, state: ConversationState.NEW_CONTACT, data: {} },
    });
  }

  const data = sd(session);
  const step = data.step;

  logger.info('Bot', { phone, step: step ?? session.state, text: text.slice(0, 60) });

  if (upper === 'HOLA' || upper === 'MENÚ' || upper === 'MENU' || upper === 'INICIO') {
    await prisma.botSession.update({
      where: { phone },
      data: { state: ConversationState.ACTIVE, data: { step: 'MENU' } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, MAIN_MENU, 'MENU');
    return;
  }

  if (step === 'MENU') {
    if (upper === '1' || upper.includes('BEBE') || upper.includes('MUESTRA')) {
      await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
      await send(phone, BABY_CLASS_MSG, 'INFO');
      return;
    }
    if (upper === '2' || upper.includes('VERANO') || upper.includes('CURSO')) {
      await handleSummerCourses(phone);
      return;
    }
    if (upper === '3' || upper.includes('NIÑO') || upper.includes('5 AÑOS')) {
      await send(phone, CLASE_NINOS_MSG, 'INFO');
      return;
    }
    if (upper === '4' || upper.includes('ADULTO')) {
      await send(phone, CLASE_ADULTOS_MSG, 'INFO');
      return;
    }
    if (upper === '5' || upper.includes('PAGO') || upper.includes('PAGAR')) {
      await send(phone, PAYMENT_MSG, 'INFO');
      return;
    }
    if (upper === '6' || upper.includes('CANCELAR') || upper.includes('CAMBIAR')) {
      await send(phone, CANCEL_MSG, 'INFO');
      return;
    }
    await send(phone, MAIN_MENU, 'MENU');
    return;
  }

  if (step === 'CURSO_SELECT') {
    const courses = data.courses || [];
    const idx = parseInt(upper);
    if (!isNaN(idx) && idx >= 1 && idx <= courses.length) {
      const course = courses[idx - 1];
      await prisma.botSession.update({
        where: { phone },
        data: { data: { step: 'CURSO_NAME', courseId: course.id, courseName: course.name } as unknown as Prisma.InputJsonValue },
      });
      await send(phone, `📝 *Inscripción a ${course.name}*\n\nPor favor escribe el *nombre completo* del alumno(a):`, 'CURSO');
      return;
    }
    await send(phone, 'Por favor responde con el número del curso que te interesa.\n\n_Escribe *hola* para volver al menú_', 'CURSO');
    return;
  }

  if (step === 'CURSO_NAME') {
    await prisma.botSession.update({
      where: { phone },
      data: { data: { ...data, step: 'CURSO_CONFIRM', studentName: text.trim() } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, `Confirma tu inscripción:\n\n👤 Alumno(a): *${text.trim()}*\n🏊 Curso: *${data.courseName}*\n\nResponde *SI* para confirmar o *NO* para cancelar.`, 'CURSO');
    return;
  }

  if (step === 'CURSO_CONFIRM') {
    if (upper === 'SI' || upper === 'SÍ' || upper === 'YES') {
      try {
        await prisma.summerCourseEnrollment.create({
          data: {
            courseId: data.courseId,
            studentPhone: phone,
            studentName: data.studentName,
            status: 'PENDING',
          },
        });
        await send(phone, `✅ *Solicitud enviada*\n\nTu solicitud de inscripción a *${data.courseName}* ha sido recibida.\n\nUn administrador revisará tu solicitud y te confirmará por este medio.\n\n¡Gracias por formar parte de *OLIMPO*! 🏊\n\n_Escribe *hola* para volver al menú_`, 'CURSO');
      } catch (err: any) {
        if (err.code === 'P2002') {
          await send(phone, `Ya tienes una solicitud de inscripción para este curso o hay una inscripción activa.\n\n_Escribe *hola* para volver al menú_`, 'CURSO');
        } else {
          await send(phone, `Hubo un error al enviar tu solicitud. Por favor intenta más tarde.\n\n_Escribe *hola* para volver al menú_`, 'CURSO');
        }
      }
      await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
      return;
    }
    await send(phone, `Inscripción cancelada.\n\n_Escribe *hola* para volver al menú_`, 'CURSO');
    await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
    return;
  }

  if (step === 'AWAITING_NAME') {
    await prisma.botSession.update({
      where: { phone },
      data: { data: { ...data, step: 'AWAITING_MODALITY_CHOICE', studentName: text.trim() } as unknown as Prisma.InputJsonValue },
    });
    const modalities = await prisma.modalityConfig.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const list = modalities.map((m, i) => `${N[i]} ${m.name}`).join('\n');
    await send(phone, `Gracias *${text.trim()}*. Ahora selecciona la modalidad:\n\n${list}\n\n_Escribe *hola* para volver al menú_`, 'ONBOARDING');
    return;
  }

  if (step === 'AWAITING_MODALITY_CHOICE') {
    const modalities = await prisma.modalityConfig.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const idx = parseInt(upper);
    if (isNaN(idx) || idx < 1 || idx > modalities.length) {
      const list = modalities.map((m, i) => `${N[i]} ${m.name}`).join('\n');
      await send(phone, `Por favor selecciona una opción válida:\n\n${list}`, 'ONBOARDING');
      return;
    }
    const mod = modalities[idx - 1];
    // Get available schedules for this modality
    const schedules = await prisma.schedule.findMany({
      where: { isActive: true, modalities: { some: { modalityId: mod.id } } },
      include: { modalities: { include: { modality: true } }, slots: { where: { isActive: true } }, teacher: { include: { user: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    const available = schedules.filter(s => s.slots.length < s.capacity);
    if (available.length === 0) {
      await send(phone, `Lo sentimos, no hay horarios disponibles para *${mod.name}* en este momento.\n\n_Escribe *hola* para volver al menú_`, 'ONBOARDING');
      await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
      return;
    }
    const list = available.map((s, i) => `${N[i]} ${DAY_ES[s.dayOfWeek]} ${s.startTime}–${s.endTime} · ${s.teacher?.user.name || 'Por asignar'} (${s.slots.length}/${s.capacity})`).join('\n');
    await prisma.botSession.update({
      where: { phone },
      data: { data: { ...data, step: 'AWAITING_SCHEDULE_CHOICE', modalityId: mod.id, modalityEnum: mod.modality, schedules: available.map(s => s.id) } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, `Horarios disponibles para *${mod.name}*:\n\n${list}\n\n_Responde con el número del horario_`, 'ONBOARDING');
    return;
  }

  if (step === 'AWAITING_SCHEDULE_CHOICE') {
    const scheduleIds = data.schedules || [];
    const idx = parseInt(upper);
    if (isNaN(idx) || idx < 1 || idx > scheduleIds.length) {
      await send(phone, 'Por favor responde con el número del horario.', 'ONBOARDING');
      return;
    }
    const scheduleId = scheduleIds[idx - 1];
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { modalities: { include: { modality: true } }, teacher: { include: { user: true } }, slots: { where: { isActive: true } } },
    });
    if (!schedule || schedule.slots.length >= schedule.capacity) {
      await send(phone, 'Este horario ya no tiene cupo disponible. Por favor selecciona otro.\n\n_Escribe *hola* para reiniciar_', 'ONBOARDING');
      await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
      return;
    }
    await prisma.botSession.update({
      where: { phone },
      data: { data: { ...data, step: 'AWAITING_REGULATION', scheduleId } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, REGULATION_MSG, 'REGULATION');
    return;
  }

  if (step === 'AWAITING_REGULATION') {
    if (upper === 'ACEPTO') {
      await prisma.regulationSignature.create({
        data: {
          studentPhone: phone,
          regulationVersion: 'v1.0',
        },
      });
      const result = await createStudentAndSlot(phone, data.studentName, data.scheduleId, data.modalityEnum);
      if (!result) {
        await send(phone, 'Hubo un problema al registrar tu inscripción. Por favor contacta a administración.\n\n_Escribe *hola* para volver al menú_', 'ONBOARDING');
      } else {
        await send(phone, `✅ *¡Inscripción registrada!*\n\nGracias *${data.studentName}*, tu pre-inscripción ha sido registrada.\n\nUn administrador te contactará para confirmar tu lugar y darte información sobre el pago de inscripción ($200 MXN).\n\n¡Bienvenido(a) a *OLIMPO*! 🏊\n\n_Escribe *hola* para volver al menú_`, 'ONBOARDING');
      }
      await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
      return;
    }
    if (upper === 'NO ACEPTO') {
      await send(phone, 'Inscripción cancelada. Si cambias de opinión, escribe *hola* para iniciar de nuevo.\n\n_Escribe *hola* para volver al menú_', 'ONBOARDING');
      await prisma.botSession.update({ where: { phone }, data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue } });
      return;
    }
    await send(phone, REGULATION_MSG, 'REGULATION');
    return;
  }

  // Default: show menu
  await prisma.botSession.update({
    where: { phone },
    data: { state: ConversationState.ACTIVE, data: { step: 'MENU' } as unknown as Prisma.InputJsonValue },
  });
  await send(phone, MAIN_MENU, 'MENU');
}

async function handleSummerCourses(phone: string) {
  const available = await prisma.summerCourse.findMany({
    where: { status: 'ACTIVE' },
    include: { enrollments: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } } },
    orderBy: { startDate: 'asc' },
  });

  if (available.length === 0) {
    await send(phone, `Por el momento no hay cursos de verano activos.\n\n_Escribe *hola* para volver al menú_`, 'CURSOS');
    await prisma.botSession.update({
      where: { phone },
      data: { data: { step: 'MENU' } as unknown as Prisma.InputJsonValue },
    });
    return;
  }

  const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' };
  const items = available.map(c => ({
    id: c.id,
    name: c.name,
    price: Number(c.price),
    spots: c.maxCapacity - c.enrollments.length,
    period: c.period,
    start: new Date(c.startDate).toLocaleDateString('es-MX', dateOpts),
    end: new Date(c.endDate).toLocaleDateString('es-MX', dateOpts),
  }));

  const list = items.map((c, i) =>
    `${N[i]} 🏊 *${c.name}*\n   📅 ${c.start} al ${c.end}\n   🕐 ${c.period}\n   💰 $${c.price.toLocaleString('es-MX')} MXN · ✅ ${c.spots} lugares`
  ).join('\n\n');

  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'CURSO_SELECT', courses: items } as unknown as Prisma.InputJsonValue },
  });

  await send(phone,
    `🌞 *CURSOS DE VERANO OLIMPO* 🏊‍♂️\n\n¡Aprovecha el verano con nosotros! ☀️\n\n━━━━━━━━━━━━━━━━━━━\n\n${list}\n\n━━━━━━━━━━━━━━━━━━━\n_Responde con el número del curso que te interesa_\n\n_Escribe *hola* para volver al menú_`,
    'CURSOS'
  );
}
