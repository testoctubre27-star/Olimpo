// ─── Templates (mensajes para acciones administrativas) ──────────────

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

  slotReleased(name: string): string {
    return (
      `Hola *${name}*.\n\n` +
      `Lamentamos informarte que tu lugar ha sido *liberado* por falta de pago al corte del día 5.\n\n` +
      `Si deseas recuperar tu espacio, contáctanos para verificar disponibilidad.\n\n` +
      `Quedamos a tus órdenes en *OLIMPO*. 🏊`
    );
  },
};
