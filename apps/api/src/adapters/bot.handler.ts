import { ConversationState, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { logger } from '../config/logger';

// ─── Number emojis ────────────────────────────
const N = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
  '1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣','1️⃣6️⃣','1️⃣7️⃣','1️⃣8️⃣','1️⃣9️⃣','2️⃣0️⃣', 21,'2️⃣2️⃣','2️⃣3️⃣','2️⃣4️⃣','2️⃣5️⃣','2️⃣6️⃣','2️⃣7️⃣','2️⃣8️⃣','2️⃣9️⃣','3️⃣0️⃣', 31,'3️⃣2️⃣','3️⃣3️⃣','3️⃣4️⃣','3️⃣5️⃣','3️⃣6️⃣','3️⃣7️⃣','3️⃣8️⃣','3️⃣9️⃣','4️⃣0️⃣', 41,'4️⃣2️⃣','4️⃣3️⃣','4️⃣4️⃣','4️⃣5️⃣','4️⃣6️⃣','4️⃣7️⃣','4️⃣8️⃣','4️⃣9️⃣','5️⃣0️⃣', 51,'5️⃣2️⃣','5️⃣3️⃣','5️⃣4️⃣','5️⃣5️⃣','5️⃣6️⃣','5️⃣7️⃣','5️⃣8️⃣','5️⃣9️⃣','6️⃣0️⃣', 61,'6️⃣2️⃣','6️⃣3️⃣','6️⃣4️⃣','6️⃣5️⃣','6️⃣6️⃣','6️⃣7️⃣','6️⃣8️⃣','6️⃣9️⃣','7️⃣0️⃣', 71,'7️⃣2️⃣','7️⃣3️⃣','7️⃣4️⃣','7️⃣5️⃣','7️⃣6️⃣','7️⃣7️⃣','7️⃣8️⃣','7️⃣9️⃣','8️⃣0️⃣', 81,'8️⃣2️⃣','8️⃣3️⃣','8️⃣4️⃣','8️⃣5️⃣','8️⃣6️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️️', '8⃣7⃣', '8⃣8⃣', '8⃣9⃣', '9⃣0⃣', 91,'9⃣2⃣', '9⃣3⃣', '9⃣4⃣', '9⃣5⃣', '9⃣6⃣', '9⃣7⃣', '9⃣8⃣', '9⃣9⃣', '🔟0⃣'];

const DAY_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ─── Teacher emails ───────────────────────────
const EMAIL_ANGEL = 'ramosan@olimpo.mx';
const EMAIL_NANCY = 'riveranc@olimpo.mx';

// ─── Modality groups per menu option ──────────
const MOD_BEBES   = ['BABY_PHASE1', 'BABY_PHASE2', 'BABY_PHASE3', 'PERSONAL_CHILD'];
const MOD_NINOS   = ['GROUP_CHILD'];
const MOD_ADULTOS = ['GROUP_ADULT'];

// ─── Send helper ──────────────────────────────
async function send(phone: string, body: string, type = 'BOT') {
  await WhatsAppAdapter.send({ to: phone, body, type });
}

// ─── Session data ─────────────────────────────
interface SD {
  step?: string;
  name?: string;
  // clase muestra / schedule selection
  scheduleId?: string;
  scheduleLabel?: string;
  teacherName?: string;
  schedules?: { id: string; label: string; teacherName: string }[];
  // cursos
  courseId?: string;
  courseName?: string;
  coursePrice?: number;
  [k: string]: unknown;
}

function sd(session: { data: unknown }): SD {
  return (session.data ?? {}) as SD;
}

async function saveSD(phone: string, data: SD) {
  await prisma.botSession.update({
    where: { phone },
    data: { data: data as unknown as Prisma.InputJsonValue },
  });
}

// ─── Fetch available schedules ─────────────────
// Returns schedules (not full) for the given teacher emails and modality enums.
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
        { modality:   { modality: { in: modalityEnums as never[] } } },
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
      const modName     = s.modalities?.[0]?.modality?.name ?? 'Clase';
      const teacherName = s.teacherId ? (nameById[s.teacherId] ?? 'Por asignar') : 'Por asignar';
      return {
        id:   s.id,
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

// ─── CLASS INFO MESSAGES ───────────────────────
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

// ─── PAYMENT INFO ─────────────────────────────
const PAYMENT_MSG = `💳 *INFORMACIÓN PARA REALIZAR TU PAGO* 💰

Puedes transferirnos directamente con estos datos:

🏦 *CLABE:* 722969010560005718
👤 *Beneficiario:* Alejandra Flores Prior
🏛️ *Institución:* Mercado Pago W
📱 *Celular vinculado a Dimo®️:* —

━━━━━━━━━━━━━━━━━━━
📸 *Una vez realizado el pago*, envía tu comprobante y un administrador confirmará tu lugar a la brevedad.

¡Gracias por confiar en *OLIMPO*! 🙏🏊‍♂️

_Escribe *hola* para volver al menú principal_ 👋`;

// ─── CANCEL MSG ───────────────────────────────
const CANCEL_MSG = `❌ *CANCELAR O CAMBIAR CITA* 📅

Para gestionar tu cita comunícate directamente con nosotros:

👩‍💼 *Administración OLIMPO*
📞 Un asesor te atenderá a la brevedad

━━━━━━━━━━━━━━━━━━━
ℹ️ _Recuerda que los cambios de horario están sujetos a disponibilidad._

_Escribe *hola* para volver al menú principal_ 👋`;

// ─── HANDLER ─────────────────────────────────
export async function handleIncomingMessage(phone: string, body: string): Promise<void> {
  const text = body.trim().toUpperCase();

  let session = await prisma.botSession.findUnique({ where: { phone } });
  if (!session) {
    session = await prisma.botSession.create({
      data: { phone, state: ConversationState.NEW_CONTACT, data: {} },
    });
  }

  logger.info('Bot', { phone, step: sd(session).step ?? session.state, text: text.slice(0, 60) });

  const data = sd(session);

  // ── Always restart on HOLA / MENU ──────────
  if (['HOLA', 'HOLA!', 'MENU', 'MENÚ', 'INICIO', 'HELLO', 'HI', 'BUENAS', 'BUENOS DÍAS', 'BUENAS TARDES'].includes(text) || session.state === ConversationState.NEW_CONTACT) {
    await prisma.botSession.update({
      where: { phone },
      data: { state: ConversationState.ACTIVE, data: { step: 'MAIN' } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, MAIN_MENU, 'MENU');
    return;
  }

  const step = data.step ?? 'MAIN';

  // ════════════════════════════════════════════
  // MAIN MENU
  // ════════════════════════════════════════════
  if (step === 'MAIN') {
    switch (text) {
      case '1': await handleClaseMuestra(phone, data);    break;
      case '2': await handleCursos(phone, data);          break;
      case '3': await handleClaseNinos(phone, data);      break;
      case '4': await handleClaseAdultos(phone, data);    break;
      case '5': {
        await send(phone, PAYMENT_MSG, 'PAYMENT');
        await saveSD(phone, { step: 'DONE' });
        break;
      }
      case '6': {
        await send(phone, CANCEL_MSG, 'CANCEL');
        await saveSD(phone, { step: 'DONE' });
        break;
      }
      default: {
        await send(phone, `🤔 No entendí tu mensaje.\n\n${MAIN_MENU}`, 'RETRY');
        break;
      }
    }
    return;
  }

  // ════════════════════════════════════════════
  // CLASE MUESTRA — elegir horario
  // ════════════════════════════════════════════
  if (step === 'CLASE_MUESTRA_SCHEDULE') {
    const schedules = data.schedules ?? [];
    const idx = parseInt(text) - 1;
    const chosen = schedules[idx];

    if (!chosen) {
      await send(phone, `⚠️ Opción inválida. Por favor elige un número del 1 al ${schedules.length || '?'}.`, 'RETRY');
      return;
    }

    await saveSD(phone, { ...data, step: 'CLASE_MUESTRA_CONFIRM', scheduleId: chosen.id, scheduleLabel: chosen.label, teacherName: chosen.teacherName });
    await send(phone,
      `📋 *RESUMEN DE TU CLASE MUESTRA* 🎓\n\n` +
      `📅 *Horario elegido:* ${chosen.label}\n` +
      `🏊 *Maestro:* ${chosen.teacherName}\n` +
      `✨ *Es completamente gratuita* — Solo ven y conócenos!\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `¿Confirmas tu clase muestra?\n\n${N[0]} ✅ Sí, confirmar\n${N[1]} ❌ No, elegir otro horario`,
      'CLASE_CONFIRM'
    );
    return;
  }

  if (step === 'CLASE_MUESTRA_CONFIRM') {
    if (text === '1') {
      await prisma.notificationLog.create({
        data: {
          phone,
          type: 'CLASE_MUESTRA',
          message: `Clase muestra solicitada: ${data.scheduleLabel} — teléfono: ${phone}`,
        },
      });
      await saveSD(phone, { step: 'DONE' });
      await send(phone,
        `🎉 *¡CLASE MUESTRA CONFIRMADA!* 🏊‍♂️\n\n` +
        `📅 *Horario:* ${data.scheduleLabel}\n` +
        `👨‍🏫 *Maestro:* ${data.teacherName}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📍 *Dirección:* Poza Rica, Ver.\n` +
        `⚠️ Recuerda traer:\n` +
        `   🩱 Traje de baño o licra\n` +
        `   🏊 Gogles y gorra\n` +
        `   🚿 Toalla\n\n` +
        `¡Te esperamos con gusto! 😊🌊\n\n` +
        `_Escribe *hola* para volver al menú_ 👋`,
        'CLASE_DONE'
      );
    } else if (text === '2') {
      await handleClaseMuestra(phone, {});
    } else {
      await send(phone, `⚠️ Responde *1* para confirmar o *2* para elegir otro horario.`, 'RETRY');
    }
    return;
  }

  // ════════════════════════════════════════════
  // CLASE GRUPAL NIÑOS — elegir horario
  // ════════════════════════════════════════════
  if (step === 'CLASE_NINOS_SCHEDULE') {
    const schedules = data.schedules ?? [];
    const idx = parseInt(text) - 1;
    const chosen = schedules[idx];

    if (!chosen) {
      await send(phone, `⚠️ Opción inválida. Por favor elige un número del 1 al ${schedules.length || '?'}.`, 'RETRY');
      return;
    }

    await saveSD(phone, { ...data, step: 'CLASE_NINOS_CONFIRM', scheduleId: chosen.id, scheduleLabel: chosen.label, teacherName: chosen.teacherName });
    await send(phone,
      `📋 *RESUMEN DE TU LUGAR* 👦🏻🏊‍♂️\n\n` +
      `📅 *Horario elegido:* ${chosen.label}\n` +
      `🏊 *Maestro:* ${chosen.teacherName}\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `¿Confirmas tu interés en este horario?\n\n${N[0]} ✅ Sí, apartar lugar\n${N[1]} ❌ No, elegir otro horario`,
      'CLASE_NINOS_CONFIRM'
    );
    return;
  }

  if (step === 'CLASE_NINOS_CONFIRM') {
    if (text === '1') {
      await prisma.notificationLog.create({
        data: {
          phone,
          type: 'CLASE_NINOS_INTEREST',
          message: `Interés en clase grupal niños: ${data.scheduleLabel} — teléfono: ${phone}`,
        },
      });
      await saveSD(phone, { step: 'DONE' });
      await send(phone,
        `✅ *¡LUGAR APARTADO!* 👦🏻🌊\n\n` +
        `📅 *Horario:* ${data.scheduleLabel}\n` +
        `👨‍🏫 *Maestro:* ${data.teacherName}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Un asesor se pondrá en contacto contigo para confirmar tu inscripción. 🙏\n\n` +
        `⚠️ Recuerda traer:\n` +
        `   🧢 Gorro · 🥽 Googles · 🩱 Traje de baño\n\n` +
        `¡Te esperamos! 😊\n\n` +
        `_Escribe *hola* para volver al menú_ 👋`,
        'CLASE_NINOS_DONE'
      );
    } else if (text === '2') {
      await handleClaseNinos(phone, {});
    } else {
      await send(phone, `⚠️ Responde *1* para confirmar o *2* para elegir otro horario.`, 'RETRY');
    }
    return;
  }

  // ════════════════════════════════════════════
  // CLASE GRUPAL ADULTOS — elegir horario
  // ════════════════════════════════════════════
  if (step === 'CLASE_ADULTOS_SCHEDULE') {
    const schedules = data.schedules ?? [];
    const idx = parseInt(text) - 1;
    const chosen = schedules[idx];

    if (!chosen) {
      await send(phone, `⚠️ Opción inválida. Por favor elige un número del 1 al ${schedules.length || '?'}.`, 'RETRY');
      return;
    }

    await saveSD(phone, { ...data, step: 'CLASE_ADULTOS_CONFIRM', scheduleId: chosen.id, scheduleLabel: chosen.label, teacherName: chosen.teacherName });
    await send(phone,
      `📋 *RESUMEN DE TU LUGAR* 🙋🏻🏊‍♀️\n\n` +
      `📅 *Horario elegido:* ${chosen.label}\n` +
      `🏊 *Maestro/a:* ${chosen.teacherName}\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `¿Confirmas tu interés en este horario?\n\n${N[0]} ✅ Sí, apartar lugar\n${N[1]} ❌ No, elegir otro horario`,
      'CLASE_ADULTOS_CONFIRM'
    );
    return;
  }

  if (step === 'CLASE_ADULTOS_CONFIRM') {
    if (text === '1') {
      await prisma.notificationLog.create({
        data: {
          phone,
          type: 'CLASE_ADULTOS_INTEREST',
          message: `Interés en clase grupal adultos: ${data.scheduleLabel} — teléfono: ${phone}`,
        },
      });
      await saveSD(phone, { step: 'DONE' });
      await send(phone,
        `✅ *¡LUGAR APARTADO!* 🙋🏻🌊\n\n` +
        `📅 *Horario:* ${data.scheduleLabel}\n` +
        `👨‍🏫 *Maestro/a:* ${data.teacherName}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Un asesor se pondrá en contacto contigo para confirmar tu inscripción. 🙏\n\n` +
        `⚠️ Recuerda traer:\n` +
        `   🧢 Gorro · 🥽 Googles · 🩱 Traje de baño\n\n` +
        `¡Te esperamos! 😊\n\n` +
        `_Escribe *hola* para volver al menú_ 👋`,
        'CLASE_ADULTOS_DONE'
      );
    } else if (text === '2') {
      await handleClaseAdultos(phone, {});
    } else {
      await send(phone, `⚠️ Responde *1* para confirmar o *2* para elegir otro horario.`, 'RETRY');
    }
    return;
  }

  // ════════════════════════════════════════════
  // CURSOS DE VERANO — elegir curso
  // ════════════════════════════════════════════
  if (step === 'CURSO_SELECT') {
    const courses = data.courses as { id: string; name: string; price: number; spots: number; period: string; start: string; end: string }[];
    const idx = parseInt(text) - 1;
    const chosen = courses?.[idx];

    if (!chosen) {
      await send(phone, `⚠️ Opción inválida. Elige un número del 1 al ${courses?.length ?? '?'}.`, 'RETRY');
      return;
    }

    await saveSD(phone, { ...data, step: 'CURSO_CONFIRM', courseId: chosen.id, courseName: chosen.name, coursePrice: chosen.price });
    await send(phone,
      `📋 *RESUMEN DE TU INSCRIPCIÓN* 🌞\n\n` +
      `🏊 *Curso:* ${chosen.name}\n` +
      `📅 *Fechas:* ${chosen.start} al ${chosen.end}\n` +
      `🕐 *Horario:* ${chosen.period}\n` +
      `💰 *Precio:* $${chosen.price.toLocaleString('es-MX')} MXN\n` +
      `✅ *Lugares disponibles:* ${chosen.spots}\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `El pago es *50% de anticipo* para apartar tu lugar.\n\n` +
      `¿Confirmas tu inscripción?\n\n${N[0]} ✅ Sí, inscribirme\n${N[1]} ❌ No, elegir otro`,
      'CURSO_CONFIRM'
    );
    return;
  }

  if (step === 'CURSO_CONFIRM') {
    if (text === '1') {
      await prisma.notificationLog.create({
        data: {
          phone,
          type: 'EXTRA_ENROLLMENT',
          message: `Interés en curso de verano: ${data.courseName} — teléfono: ${phone}. Pendiente de confirmar anticipo 50%.`,
        },
      });
      await saveSD(phone, { step: 'DONE' });
      await send(phone,
        `🎉 *¡INSCRIPCIÓN REGISTRADA!* 🌞🏊‍♂️\n\n` +
        `📚 *Curso:* ${data.courseName}\n` +
        `💰 *Anticipo (50%):* $${Math.round((data.coursePrice as number) / 2).toLocaleString('es-MX')} MXN\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `💳 *Para apartar tu lugar*, realiza el anticipo a:\n\n` +
        `🏦 *CLABE:* 722969010560005718\n` +
        `👤 *Beneficiario:* Alejandra Flores Prior\n` +
        `🏛️ *Institución:* Mercado Pago W\n\n` +
        `📸 Envía tu comprobante y un administrador confirmará tu lugar. ✅\n\n` +
        `¡Nos vemos en el agua! 🌊😊\n\n` +
        `_Escribe *hola* para volver al menú_ 👋`,
        'CURSO_DONE'
      );
    } else if (text === '2') {
      await handleCursos(phone, {});
    } else {
      await send(phone, `⚠️ Responde *1* para confirmar o *2* para elegir otro curso.`, 'RETRY');
    }
    return;
  }

  // ════════════════════════════════════════════
  // DONE — cualquier mensaje reinicia
  // ════════════════════════════════════════════
  if (step === 'DONE') {
    await prisma.botSession.update({
      where: { phone },
      data: { data: { step: 'MAIN' } as unknown as Prisma.InputJsonValue },
    });
    await send(phone, MAIN_MENU, 'MENU');
    return;
  }

  // Default — show menu
  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'MAIN' } as unknown as Prisma.InputJsonValue },
  });
  await send(phone, MAIN_MENU, 'MENU');
}

// ─── CLASE MUESTRA handler ────────────────────
// Shows available baby/personal schedules from both Angel and Nancy.
async function handleClaseMuestra(phone: string, _data: SD) {
  const available = await getAvailableSchedules([EMAIL_ANGEL, EMAIL_NANCY], MOD_BEBES);

  if (available.length === 0) {
    await send(phone,
      `😔 En este momento no tenemos horarios disponibles para clase muestra.\n\n` +
      `Por favor contáctanos directamente y con gusto te atendemos. 🙏\n\n` +
      `_Escribe *hola* para volver al menú_ 👋`
    );
    return;
  }

  const list = available.map((it, i) => `${N[i]} ${it.label}`).join('\n');

  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'CLASE_MUESTRA_SCHEDULE', schedules: available } as unknown as Prisma.InputJsonValue },
  });

  await send(phone,
    `🎓 *CLASE MUESTRA GRATUITA* ✨\n\n` +
    `¡Ven a conocer nuestras instalaciones sin costo! 🏊‍♂️\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 *Horarios disponibles:*\n\n` +
    `${list}\n\n` +
    `_Responde con el número del horario que prefieres_ 👆`,
    'CLASE_MUESTRA'
  );
}

// ─── CLASE GRUPAL NIÑOS handler ───────────────
// Shows available GROUP_CHILD schedules from Nancy, or static info if none.
async function handleClaseNinos(phone: string, _data: SD) {
  const available = await getAvailableSchedules([EMAIL_NANCY], MOD_NINOS);

  if (available.length === 0) {
    await send(phone, CLASE_NINOS_MSG, 'CLASE_NINOS');
    await saveSD(phone, { step: 'DONE' });
    return;
  }

  const list = available.map((it, i) => `${N[i]} ${it.label}`).join('\n');

  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'CLASE_NINOS_SCHEDULE', schedules: available } as unknown as Prisma.InputJsonValue },
  });

  await send(phone,
    `👦🏻 *CLASE GRUPAL: 5 AÑOS EN ADELANTE* 🏊‍♂️\n\n` +
    `¡Aprende a nadar en un ambiente grupal y divertido! 🌊\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 *Horarios disponibles:*\n\n` +
    `${list}\n\n` +
    `_Responde con el número del horario que prefieres_ 👆`,
    'CLASE_NINOS'
  );
}

// ─── CLASE GRUPAL ADULTOS handler ─────────────
// Shows available GROUP_ADULT schedules from Nancy, or static info if none.
async function handleClaseAdultos(phone: string, _data: SD) {
  const available = await getAvailableSchedules([EMAIL_NANCY], MOD_ADULTOS);

  if (available.length === 0) {
    await send(phone, CLASE_ADULTOS_MSG, 'CLASE_ADULTOS');
    await saveSD(phone, { step: 'DONE' });
    return;
  }

  const list = available.map((it, i) => `${N[i]} ${it.label}`).join('\n');

  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'CLASE_ADULTOS_SCHEDULE', schedules: available } as unknown as Prisma.InputJsonValue },
  });

  await send(phone,
    `🙋🏻 *CLASE GRUPAL: ADULTOS* 🏊‍♀️\n\n` +
    `¡Aprende o perfecciona tu técnica de natación! 🌊\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 *Horarios disponibles:*\n\n` +
    `${list}\n\n` +
    `_Responde con el número del horario que prefieres_ 👆`,
    'CLASE_ADULTOS'
  );
}

// ─── CURSOS handler ───────────────────────────
async function handleCursos(phone: string, _data: SD) {
  const courses = await prisma.summerCourse.findMany({
    where: { status: 'ACTIVE' },
    include: { enrollments: { where: { status: 'CONFIRMED' } } },
    orderBy: { startDate: 'asc' },
  });

  const available = courses.filter(c => c.enrollments.length < c.maxCapacity);

  if (available.length === 0) {
    await send(phone,
      `😔 En este momento no hay cursos de verano disponibles.\n\n` +
      `¡Mantente atento a nuestras próximas fechas! 🌞\n\n` +
      `_Escribe *hola* para volver al menú_ 👋`
    );
    return;
  }

  const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' };

  const items = available.map(c => ({
    id:     c.id,
    name:   c.name,
    price:  Number(c.price),
    spots:  c.maxCapacity - c.enrollments.length,
    period: c.period,
    start:  new Date(c.startDate).toLocaleDateString('es-MX', dateOpts),
    end:    new Date(c.endDate).toLocaleDateString('es-MX', dateOpts),
  }));

  const list = items.map((c, i) =>
    `${N[i]} 🏊 *${c.name}*\n` +
    `   📅 ${c.start} al ${c.end}\n` +
    `   🕐 ${c.period}\n` +
    `   💰 $${c.price.toLocaleString('es-MX')} MXN · ✅ ${c.spots} lugares`
  ).join('\n\n');

  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'CURSO_SELECT', courses: items } as unknown as Prisma.InputJsonValue },
  });

  await send(phone,
    `🌞 *CURSOS DE VERANO OLIMPO* 🏊‍♂️\n\n` +
    `¡Aprovecha el verano con nosotros! ☀️\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `${list}\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `_Responde con el número del curso que te interesa_ 👆`,
    'CURSOS'
  );
}
