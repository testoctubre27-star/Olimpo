import { prisma } from '../config/database';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { logger } from '../config/logger';

export async function runPaymentReminders(): Promise<void> {
  const today      = new Date();
  const dayOfMonth = today.getDate();
  const monthYear  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  logger.info(`[Reminder] day=${dayOfMonth} period=${monthYear}`);

  const students = await prisma.student.findMany({
    where: {
      status:            'ACTIVE',
      conversationState: 'ACTIVE',
      paymentDay:        { not: null },
    },
    include: {
      payments: {
        where: { period: monthYear, status: 'CONFIRMED' },
        take:  1,
      },
    },
  });

  let sent = 0, skipped = 0;

  for (const student of students) {
    if (student.payments.length > 0) { skipped++; continue; }

    const payDay = student.paymentDay!;
    const diff   = dayOfMonth - payDay;

    if (diff < -5 || diff > 5) continue;

    // Idempotency key stored as jobName
    const jobName = `reminder-${student.id}-${monthYear}-day${dayOfMonth}`;
    const alreadySent = await prisma.automationLog.findFirst({
      where: { jobName, status: 'SUCCESS' },
    });
    if (alreadySent) continue;

    let msg: string;
    if (diff < 0) {
      const daysLeft = Math.abs(diff);
      msg =
        `💳 *Recordatorio de pago — OLIMPO* 🏊‍♂️\n\n` +
        `Hola *${student.name}*, tu mensualidad vence en *${daysLeft} día${daysLeft === 1 ? '' : 's'}* (el día *${payDay}*).\n\n` +
        `Para pagar:\n\n` +
        `🏦 *CLABE:* 722969010560005718\n` +
        `👤 *Beneficiario:* Alejandra Flores Prior\n` +
        `🏛️ *Institución:* Mercado Pago W\n\n` +
        `📸 Envía tu comprobante y lo confirmamos de inmediato ✅\n\n` +
        `¡Gracias por ser parte de *OLIMPO*! 🙏`;
    } else if (diff === 0) {
      msg =
        `💳 *¡Hoy es tu fecha de pago!* 📅\n\n` +
        `Hola *${student.name}*, hoy día *${payDay}* es tu fecha de pago en *OLIMPO* 🏊‍♂️\n\n` +
        `🏦 *CLABE:* 722969010560005718\n` +
        `👤 *Beneficiario:* Alejandra Flores Prior\n` +
        `🏛️ *Institución:* Mercado Pago W\n\n` +
        `📸 Envía tu comprobante y lo confirmamos ✅\n\n¡Gracias! 🙏`;
    } else {
      msg =
        `⚠️ *Pago pendiente — OLIMPO* 🏊‍♂️\n\n` +
        `Hola *${student.name}*, tu pago venció hace *${diff} día${diff === 1 ? '' : 's'}* (el día ${payDay}).\n\n` +
        `Para conservar tu lugar realiza tu pago:\n\n` +
        `🏦 *CLABE:* 722969010560005718\n` +
        `👤 *Beneficiario:* Alejandra Flores Prior\n` +
        `🏛️ *Institución:* Mercado Pago W\n\n` +
        `📸 Envía tu comprobante y lo confirmamos ✅\n\n` +
        `_Si ya pagaste, ignora este mensaje_ 🙏`;
    }

    try {
      await WhatsAppAdapter.send({
        to: student.phone, body: msg,
        studentId: student.id, type: 'PAYMENT_REMINDER',
      });
      await prisma.automationLog.create({
        data: {
          jobName,
          status:  'SUCCESS',
          details: { payDay, diff, monthYear, student: student.name } as object,
        },
      });
      sent++;
      logger.info(`[Reminder] ✅ ${student.name} payDay:${payDay} diff:${diff}`);
    } catch (err) {
      logger.error(`[Reminder] ❌ ${student.name}`, { err });
      await prisma.automationLog.create({
        data: {
          jobName,
          status: 'FAILED',
          error:  err instanceof Error ? err.message : String(err),
        },
      });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  logger.info(`[Reminder] Done — sent:${sent} skipped:${skipped}`);
}
