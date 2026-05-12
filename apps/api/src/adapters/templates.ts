// All WhatsApp message templates in one place.
// Keeps business language decoupled from logic.

export const templates = {
  welcome(name: string, schedule: string, teacherName: string): string {
    return (
      `¡Bienvenido/a a la academia, ${name}! 🏊\n\n` +
      `Tu lugar ha sido confirmado.\n` +
      `📅 Horario: ${schedule}\n` +
      `👨‍🏫 Maestro: ${teacherName}\n\n` +
      `Si tienes alguna pregunta, no dudes en escribirnos. ¡Hasta pronto!`
    );
  },

  onboardingGreeting(): string {
    return (
      `¡Hola! Bienvenido/a a *OLIMPO Academia de Natación* 🏊\n\n` +
      `Estamos felices de que quieras ser parte de nuestra familia.\n\n` +
      `Para comenzar, ¿me puedes decir tu *nombre completo*?`
    );
  },

  askModality(): string {
    return (
      `Perfecto. ¿Qué tipo de clase te interesa?\n\n` +
      `1️⃣ Clases personalizadas infantiles\n` +
      `2️⃣ Clases grupales infantiles\n` +
      `3️⃣ Clases grupales adultos\n` +
      `4️⃣ Acceso libre\n` +
      `5️⃣ Terapia acuática\n\n` +
      `Responde con el *número* de tu elección.`
    );
  },

  askSchedule(available: { day: string; time: string }[]): string {
    const list = available
      .map((s, i) => `${i + 1}️⃣ ${s.day} ${s.time}`)
      .join('\n');
    return (
      `Excelente opción. Estos son los horarios disponibles:\n\n` +
      `${list}\n\n` +
      `Responde con el *número* del horario que prefieres.`
    );
  },

  sendRegulation(url: string): string {
    return (
      `Antes de continuar, necesitamos que leas y aceptes nuestro *Reglamento Interno*.\n\n` +
      `📄 Puedes consultarlo aquí: ${url}\n\n` +
      `Responde *ACEPTO* para confirmar que lo has leído y estás de acuerdo.`
    );
  },

  regulationConfirmed(name: string): string {
    return (
      `¡Gracias, ${name}! Tu aceptación del reglamento ha quedado registrada ✅\n\n` +
      `El siguiente paso es realizar tu pago de inscripción ($200 MXN) y primera mensualidad.\n\n` +
      `Un administrador te contactará para indicarte los métodos de pago disponibles.`
    );
  },

  paymentReminder(name: string, day: number): string {
    const urgency = day >= 3
      ? '⚠️ *AVISO IMPORTANTE*'
      : '📅 Recordatorio de pago';
    return (
      `${urgency}\n\n` +
      `Hola ${name}, te recordamos que tu mensualidad de este mes aún no ha sido registrada.\n\n` +
      `Tienes hasta el *día 5 del mes* para realizar tu pago y conservar tu lugar.\n\n` +
      `Si ya realizaste el pago, por favor comunícate con administración para confirmarlo.`
    );
  },

  slotReleased(name: string): string {
    return (
      `Hola ${name}.\n\n` +
      `Lamentamos informarte que tu lugar ha sido *liberado* por falta de pago al corte del día 5 del mes.\n\n` +
      `Si deseas recuperar tu espacio, contáctanos para verificar disponibilidad.\n\n` +
      `Quedamos a tus órdenes. 🏊`
    );
  },

  waitingListAvailable(name: string, schedule: string): string {
    return (
      `¡Buenas noticias, ${name}! 🎉\n\n` +
      `Se ha liberado un lugar en el horario: *${schedule}*\n\n` +
      `Tienes *24 horas* para confirmar tu interés respondiendo *CONFIRMO*.\n\n` +
      `Si no confirmamos, ofreceremos el lugar al siguiente en la lista.`
    );
  },

  unknown(): string {
    return (
      `No entendí tu mensaje. Por favor responde con una de las opciones indicadas, ` +
      `o escribe *AYUDA* para hablar con un administrador.`
    );
  },
};
