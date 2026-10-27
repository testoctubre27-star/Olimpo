export const templates = {
  welcome(name: string, schedule: string, teacherName: string) {
    return `¡Bienvenido(a) a OLIMPO, ${name}! 🏊\n\nTu clase ha sido confirmada:\n📅 ${schedule}\n👨‍🏫 Maestro: ${teacherName}\n\n¡Te esperamos!`;
  },
  slotReleased(name: string) {
    return `Hola ${name}, tu lugar ha sido liberado por falta de pago.\n\nPara reactivar tu inscripción comunícate con administración.`;
  },
  paymentOverdue(name: string, payDay: number) {
    return `⚠️ *Pago pendiente — OLIMPO*\n\nHola ${name}, tu mensualidad venció el día ${payDay}. Por favor realiza tu pago a la brevedad para conservar tu lugar.\n\nCLABE: 722969010560005718\nBeneficiario: Alejandra Flores Prior\nInstitución: Mercado Pago W\n\nEnvía tu comprobante y lo confirmamos.`;
  },
};
