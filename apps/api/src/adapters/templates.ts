import { prisma } from '../config/database';

// ─── Reglamento completo ──────────────────────
export const REGLAMENTO_TEXT = `📋 *REGLAMENTO OLIMPO — 10 Reglas para una Experiencia Segura y Respetuosa*

*1. PAGA A TIEMPO*
Realiza tu pago dentro de los días establecidos (1 al 5 o 15 al 20 de cada mes) vía transferencia o terminal. Tu horario se mantiene solo con tu pago puntual.

*2. ATIENDE LOS RECORDATORIOS*
Si no realizas tu pago, recibirás un mensaje de recordatorio. De no pagar, tu horario saldrá en oferta.

*3. ACOMPAÑANTES*
El acceso se limita a dos personas por alumno. Deben permanecer en el área de espera durante la clase.

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
const NUM_EMOJI = [
  '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
  '1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣','1️⃣6️⃣','1️⃣7️⃣','1️⃣8️⃣','1️⃣9️⃣','2️⃣0️⃣',
  '2️⃣1️⃣','2️⃣2️⃣','2️⃣3️⃣','2️⃣4️⃣','2️⃣5️⃣','2️⃣6️⃣','2️⃣7️⃣','2️⃣8️⃣','2️⃣9️⃣','3️⃣0️⃣',
];
// Max schedules to show — avoids overwhelming the user
const MAX_SCHEDULES = 20;

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

    // Fetch summer courses BEFORE deciding if menu is empty
    const courses = await prisma.summerCourse.findMany({
      where: { status: 'ACTIVE' },
      include: { enrollments: { where: { status: 'CONFIRMED' } } },
      orderBy: { startDate: 'asc' },
    });
    const availableCourses = courses.filter(c => c.enrollments.length < c.maxCapacity);

    // Now check if there is ANYTHING to show
    if (modalities.length === 0 && services.length === 0 && availableCourses.length === 0) {
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

    if (availableCourses.length > 0) {
      if (idx > 0) msg += `🌊 *CURSOS DE VERANO DISPONIBLES:*\n\n`;
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
    const limited = available.slice(0, MAX_SCHEDULES);
    const list = limited
      .map((s, i) => `${NUM_EMOJI[i] ?? `${i+1}.`} ${s.day} ${s.time}`)
      .join('\n');
    const extra = available.length > MAX_SCHEDULES
      ? `\n\n_...y ${available.length - MAX_SCHEDULES} horarios más. Escribe *AYUDA* para más opciones._`
      : '';
    return (
      `Excelente. Estos son los horarios disponibles:\n\n` +
      `${list}${extra}\n\n` +
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

  regulationConfirmed(name: string, isCourse = false): string {
    if (isCourse) {
      return (
        `¡Gracias, ${name}! ✅ Tu aceptación del reglamento ha quedado registrada.\n\n` +
        `Para *apartar tu lugar* en el curso, el siguiente paso es realizar un pago del *50% del costo total* como anticipo.\n\n` +
        `Puedes pagar:\n` +
        `🏦 Transferencia bancaria\n` +
        `💳 Terminal en el centro\n\n` +
        `Un administrador te contactará para confirmar tu anticipo y reservar tu lugar oficial. ¡Gracias por elegirnos! 🏊`
      );
    }
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

  activeMenu(name: string, enrolledCount = 1): string {
    const canAdd = enrolledCount < 5;
    const addLine = canAdd
      ? `5️⃣ Inscribir a otra persona (${enrolledCount}/5 inscritos)\n`
      : `5️⃣ Ya tienes el máximo de 5 personas inscritas\n`;
    return (
      `Hola *${name}* 👋 ¿En qué te podemos ayudar?\n\n` +
      `1️⃣ Ver mi estado de cuenta\n` +
      `2️⃣ Reportar un pago realizado\n` +
      `3️⃣ Solicitar cambio de horario\n` +
      `4️⃣ Hablar con un administrador\n` +
      addLine + `\n` +
      `Responde con el *número* de tu elección.`
    );
  },

  accountStatus(data: {
    name: string;
    modality: string;
    schedule: string;
    teacher: string;
    lastPayment: string | null;
    status: string;
    delinquent: boolean;
  }): string {
    const statusEmoji = data.delinquent ? '⚠️' : '✅';
    const statusText  = data.delinquent
      ? 'Pago pendiente — tu lugar está en riesgo'
      : 'Al corriente';
    return (
      `${statusEmoji} *Estado de cuenta — OLIMPO*\n\n` +
      `👤 *Alumno:* ${data.name}\n` +
      `🏊 *Modalidad:* ${data.modality}\n` +
      `📅 *Horario:* ${data.schedule}\n` +
      `👨‍🏫 *Instructor/a:* ${data.teacher}\n` +
      `💳 *Último pago:* ${data.lastPayment ?? 'Sin pagos registrados'}\n` +
      `📊 *Estatus:* ${statusText}\n\n` +
      `Si tienes dudas sobre tu cuenta, contáctanos directamente. 🙌`
    );
  },

  reportPaymentPrompt(): string {
    return (
      `💳 *Reportar pago*\n\n` +
      `Por favor indícanos:\n` +
      `- Monto pagado\n` +
      `- Fecha de pago\n` +
      `- Método (transferencia, efectivo, terminal)\n\n` +
      `Escribe los detalles en un solo mensaje y un administrador los verificará. ✅`
    );
  },

  changeSchedulePrompt(): string {
    return (
      `📅 *Solicitud de cambio de horario*\n\n` +
      `Por favor indícanos el horario al que deseas cambiarte (día y hora) y un administrador verificará disponibilidad y te responderá a la brevedad.\n\n` +
      `Escribe tu solicitud y la procesaremos lo antes posible. 🙌`
    );
  },

  paymentReportReceived(name: string): string {
    return (
      `¡Gracias *${name}*! 📩\n\n` +
      `Recibimos tu reporte de pago. Un administrador lo verificará y actualizará tu cuenta a la brevedad.\n\n` +
      `Si necesitas algo más, escribe *MENÚ* en cualquier momento.`
    );
  },

  requestReceived(name: string): string {
    return (
      `¡Gracias *${name}*! 📩\n\n` +
      `Recibimos tu solicitud. Un administrador te contactará a la brevedad.\n\n` +
      `Si necesitas algo más, escribe *MENÚ* en cualquier momento.`
    );
  },
};
