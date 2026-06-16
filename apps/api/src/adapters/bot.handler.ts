import { ConversationState, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { logger } from '../config/logger';

// ─── Number emojis ────────────────────────────
const N = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
  '1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣','1️⃣6️⃣','1️⃣7️⃣','1️⃣8️⃣','1️⃣9️⃣','2️⃣0️⃣'];

const DAY_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ─── Send helper ──────────────────────────────
async function send(phone: string, body: string, type = 'BOT') {
  await WhatsAppAdapter.send({ to: phone, body, type });
}

// ─── Session data ─────────────────────────────
interface SD {
  step?: string;
  name?: string;
  // clase muestra
  scheduleId?: string;
  scheduleLabel?: string;
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

// ─── MAIN MENU ────────────────────────────────
const MAIN_MENU = `🏊‍♂️ ¡Bienvenido a *OLIMPO Centro de Terapia y Deporte*! 🌊

¿En qué te podemos ayudar hoy? 👇

${N[0]} 🎓 *Clase de Bebé (Clase muestra)* — Conoce nuestras instalaciones
${N[1]} 🌞 *Cursos de verano* — Inscríbete ahora
${N[2]} 👶🏼 *Clase bebés: 5 meses - 5 años* — Información
${N[3]} 👦🏻 *Clase grupal: 5 años en adelante* — Información
${N[4]} 🙋🏻 *Clase grupal: Adultos* — Información
${N[5]} 💳 *Realizar un pago* — Datos bancarios
${N[6]} ❌ *Cancelar / Cambiar cita* — Gestionar mi lugar

_Responde con el número de tu elección_ 👆`;

// ─── CLASS INFO MESSAGES ───────────────────────
const CLASE_BEBES_MSG = `👶🏼 *CLASE BEBÉS: 5 MESES - 5 AÑOS* 🌊

¡Estimulación temprana en el agua junto a sus papás! 💙

━━━━━━━━━━━━━━━━━━━
⚠️ *Qué debe traer tu bebé:*

   🩲 Pañal acuático
   🧢 Gorro
   🩱 Traje de baño

━━━━━━━━━━━━━━━━━━━
Para más información o agendar tu lugar, comunícate directamente con nosotros. 🙏

_Escribe *hola* para volver al menú principal_ 👋`;

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
      case '1': await handleClaseMuestra(phone, data); break;
      case '2': await handleCursos(phone, data);       break;
      case '3': {
        await send(phone, CLASE_BEBES_MSG, 'CLASE_BEBES');
        await saveSD(phone, { step: 'DONE' });
        break;
      }
      case '4': {
        await send(phone, CLASE_NINOS_MSG, 'CLASE_NINOS');
        await saveSD(phone, { step: 'DONE' });
        break;
      }
      case '5': {
        await send(phone, CLASE_ADULTOS_MSG, 'CLASE_ADULTOS');
        await saveSD(phone, { step: 'DONE' });
        break;
      }
      case '6': {
        await send(phone, PAYMENT_MSG, 'PAYMENT');
        await saveSD(phone, { step: 'DONE' });
        break;
      }
      case '7': {
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
    const schedules = data.schedules as { id: string; label: string }[];
    const idx = parseInt(text) - 1;
    const chosen = schedules?.[idx];

    if (!chosen) {
      await send(phone, `⚠️ Opción inválida. Por favor elige un número del 1 al ${schedules?.length ?? '?'}.`, 'RETRY');
      return;
    }

    await saveSD(phone, { ...data, step: 'CLASE_MUESTRA_CONFIRM', scheduleId: chosen.id, scheduleLabel: chosen.label });
    await send(phone,
      `📋 *RESUMEN DE TU CLASE MUESTRA* 🎓\n\n` +
      `📅 *Horario elegido:* ${chosen.label}\n` +
      `🏊 *Maestro:* Ángel Nicolás Ramos Castro\n` +
      `✨ *Es completamente gratuita* — Solo ven y conócenos!\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `¿Confirmas tu clase muestra?\n\n${N[0]} ✅ Sí, confirmar\n${N[1]} ❌ No, elegir otro horario`,
      'CLASE_CONFIRM'
    );
    return;
  }

  if (step === 'CLASE_MUESTRA_CONFIRM') {
    if (text === '1') {
      // Save interest as notification log
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
        `👨‍🏫 *Maestro:* Ángel Nicolás Ramos Castro\n\n` +
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
async function handleClaseMuestra(phone: string, _data: SD) {
  // Get schedules of teacher ramosan@olimpo.mx
  const teacher = await prisma.teacher.findFirst({
    where: { user: { email: 'ramosan@olimpo.mx' } },
  });

  if (!teacher) {
    await send(phone,
      `😔 En este momento no tenemos horarios disponibles para clase muestra.\n\n` +
      `Por favor contáctanos directamente y con gusto te atendemos. 🙏\n\n` +
      `_Escribe *hola* para volver al menú_ 👋`
    );
    return;
  }

  const schedules = await prisma.schedule.findMany({
    where: { teacherId: teacher.id, isActive: true },
    include: { modalities: { include: { modality: true } }, slots: { where: { isActive: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  const available = schedules.filter(s => s.slots.length < s.capacity);

  if (available.length === 0) {
    await send(phone,
      `😔 Actualmente todos los horarios están llenos.\n\n` +
      `Escríbenos directamente para ponerte en lista de espera. 🙏\n\n` +
      `_Escribe *hola* para volver al menú_ 👋`
    );
    return;
  }

  const items = available.map(s => {
    const modName = (s.modalities?.[0]?.modality?.name) ?? 'Clase';
    return {
      id:    s.id,
      label: `${DAY_ES[s.dayOfWeek]} ${s.startTime}–${s.endTime} · ${modName}`,
    };
  });

  const list = items.map((it, i) => `${N[i]} ${it.label}`).join('\n');

  await prisma.botSession.update({
    where: { phone },
    data: { data: { step: 'CLASE_MUESTRA_SCHEDULE', schedules: items } as unknown as Prisma.InputJsonValue },
  });

  await send(phone,
    `🎓 *CLASE MUESTRA GRATUITA* ✨\n\n` +
    `¡Ven a conocer nuestras instalaciones sin costo! 🏊‍♂️\n` +
    `👨‍🏫 *Maestro:* Ángel Nicolás Ramos Castro\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 *Horarios disponibles:*\n\n` +
    `${list}\n\n` +
    `_Responde con el número del horario que prefieres_ 👆`,
    'CLASE_MUESTRA'
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
