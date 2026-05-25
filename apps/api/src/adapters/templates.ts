import { prisma } from '../config/database';

// ─── Reglamento completo ──────────────────────
export const REGLAMENTO_TEXT = `📋 *REGLAMENTO OLIMPO — 10 Reglas para una Experiencia Segura y Respetuosa*

*1. PAGA A TIEMPO*
Realiza tu pago dentro de los días establecidos (1 al 5 o 15 al 20 de cada mes) vía transferencia o terminal. Tu horario se mantiene solo con tu pago puntual.

*2. ATENDE LOS RECORDATORIOS*
Si no realizas tu pago, recibirás un mensaje de recordatorio. De no pagar, tu horario saldrá en oferta.

*3. ACOMPAÑANTES*
El acceso se limita a una persona por alumno. Debe permanecer en el área de espera durante la clase.

*4. LLEGA A TIEMPO*
Tolerancia máxima: 15 min en clases personales, 20 min en clases grupales. Después de ese tiempo, puedes perder tu clase.

*5. PAÑAL ACUÁTICO*
Obligatorio para bebés y personas que no controlen esfínteres.

*6. USA EL EQUIPO ADECUADO*
Traje de baño o licra, gorra y goggles son obligatorios. No se permite shorts, playeras ni ropa de algodón.

*7. NO CORRAS NI JUEGUES*
Por seguridad y respeto a todos, está prohibido correr, jugar o empujar en el área de la alberca y pasillos.

*8. DUCHAS ANTES DE ENTRAR*
Es obligatorio ducharse antes de ingresar a la alberca. No entres con bloqueador, cremas o gel.

*9. SIGUE LAS INDICACIONES*
Respeta a tu instructor y al personal del centro. Sus indicaciones son para tu seguridad y aprendizaje.

*10. RESPETA EL REGLAMENTO*
El cumplimiento de estas reglas ayuda a mantener un ambiente seguro, armónico y agradable para todos.

_¡Tu responsabilidad hace la diferencia! Gracias por ser parte de la familia Olimpo._ 🏊`;

// ─── Number emojis ────────────────────────────
const NUM_EMOJI = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
  '1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣'];

// ─── Templates ────────────────────────────────
export const templates = {

  welcome(name: string, schedule: string, teacherName: string): string {
    return (
      `¡Bienvenido/a a *OLIMPO*, ${name}! 🏊\n\n` +
      `Tu lugar ha sido confirmado. Estamos felices de tenerte en nuestra familia.\n\n` +
      `📅 *Horario:* ${schedule}\n` +
      `👨‍🏫 *Instructor/a:* ${teacherName}\n\n` +
      `Recuerda llevar traje de baño o licra, gorra y goggles. ¡Nos vemos en el agua!`
    );
  },

  onboardingGreeting(): string {
    return (
      `¡Hola! Bienvenido/a a *OLIMPO Centro de Terapia y Deporte* 🏊\n\n` +
      `Estamos felices de que quieras ser parte de nuestra familia.\n\n` +
      `Para comenzar, ¿me puedes decir tu *nombre completo*?`
    );
  },

  // ── Dynamic modality menu — reads isActive from DB ──
  async askModality(): Promise<string> {
    // Fetch only ACTIVE modality configs from DB
    const modalities = await prisma.modalityConfig.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    // Fetch active custom services too
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    if (modalities.length === 0 && services.length === 0) {
      return (
        `Lo sentimos, no hay modalidades disponibles en este momento.\n\n` +
        `Por favor contáctanos directamente para más información.`
      );
    }

    let msg = `¡Perfecto! ¿Qué modalidad te interesa?\n\n`;
    let idx = 0;

    for (const m of modalities) {
      const price = `$${Number(m.monthlyFee).toLocaleString('es-MX')}/mes`;
      const desc  = m.description ? `\n     ${m.description}` : '';
      msg += `${NUM_EMOJI[idx]} *${m.name}* — ${price}${desc}\n\n`;
      idx++;
    }

    for (const s of services) {
      const price = `$${Number(s.monthlyFee).toLocaleString('es-MX')}/mes`;
      const desc  = s.description ? `\n     ${s.description}` : '';
      msg += `${NUM_EMOJI[idx]} *${s.name}* — ${price}${desc}\n\n`;
      idx++;
    }

    // Append active summer courses
    const courses = await prisma.summerCourse.findMany({
      where: { status: 'ACTIVE' },
      include: { enrollments: { where: { status: 'CONFIRMED' } } },
      orderBy: { startDate: 'asc' },
    });

    const availableCourses = courses.filter(c => c.enrollments.length < c.maxCapacity);
    if (availableCourses.length > 0) {
      msg += `🌊 *CURSOS DE VERANO DISPONIBLES:*\n\n`;
      for (const c of availableCourses) {
        const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
        const start = new Date(c.startDate).toLocaleDateString('es-MX', dateOpts);
        const end   = new Date(c.endDate).toLocaleDateString('es-MX', dateOpts);
        const price = `$${Number(c.price).toLocaleString('es-MX')} total`;
        msg += `${NUM_EMOJI[idx]} *${c.name}* — ${price}\n`;
        msg += `     ${start} al ${end} · ${c.period}\n`;
        msg += `     Lugares: ${c.maxCapacity - c.enrollments.length} disponibles\n\n`;
        idx++;
      }
    }

    msg += `Responde con el *número* de tu elección.`;
    return msg;
  },

  askSchedule(available: { day: string; time: string }[]): string {
    const list = available
      .map((s, i) => `${NUM_EMOJI[i]} ${s.day} ${s.time}`)
      .join('\n');
    return (
      `Excelente. Estos son los horarios disponibles:\n\n` +
      `${list}\n\n` +
      `Responde con el *número* del horario que prefieres.`
    );
  },

  sendRegulation(): string {
    return (
      REGLAMENTO_TEXT +
      `\n\n---\n` +
      `Para continuar, responde *ACEPTO* confirmando que leíste y aceptas estas reglas.`
    );
  },

  regulationConfirmed(name: string): string {
    return (
      `¡Gracias, ${name}! ✅ Tu aceptación del reglamento ha quedado registrada.\n\n` +
      `El siguiente paso es realizar tu pago de *inscripción ($200 MXN)* y primera mensualidad.\n\n` +
      `Puedes pagar:\n` +
      `🏦 Transferencia bancaria\n` +
      `💳 Terminal en el centro\n\n` +
      `Un administrador te contactará para confirmar tu pago y activar tu lugar. ¡Gracias por elegirnos!`
    );
  },

  paymentReminder(name: string, day: number): string {
    const isUrgent = day >= 3;
    return (
      `${isUrgent ? '⚠️ *AVISO IMPORTANTE*' : '📅 Recordatorio de pago'}\n\n` +
      `Hola *${name}*, te recordamos que tu mensualidad de este mes aún no ha sido registrada.\n\n` +
      `Tienes hasta el *día 5 del mes* para realizar tu pago y conservar tu lugar.\n\n` +
      `Si ya realizaste tu pago, comunícate con administración para confirmarlo. 🏊`
    );
  },

  slotReleased(name: string): string {
    return (
      `Hola *${name}*.\n\n` +
      `Lamentamos informarte que tu lugar ha sido *liberado* por falta de pago al corte del día 5.\n\n` +
      `Si deseas recuperar tu espacio, contáctanos para verificar disponibilidad.\n\n` +
      `Quedamos a tus órdenes en *OLIMPO*. 🏊`
    );
  },

  waitingListAvailable(name: string, schedule: string): string {
    return (
      `¡Buenas noticias, *${name}*! 🎉\n\n` +
      `Se ha liberado un lugar en el horario: *${schedule}*\n\n` +
      `Tienes *24 horas* para confirmar tu interés respondiendo *CONFIRMO*.\n\n` +
      `¡No pierdas tu oportunidad!`
    );
  },

  unknown(): string {
    return (
      `No entendí tu mensaje 😅\n\n` +
      `Por favor responde con una de las opciones indicadas, o escribe *AYUDA* para hablar con un administrador de *OLIMPO*.`
    );
  },
};
