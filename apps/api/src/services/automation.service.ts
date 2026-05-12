import cron from 'node-cron';
import { prisma } from '../config/database';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { templates } from '../adapters/templates';
import { StudentService } from './student.service';
import { PaymentService } from './payment.service';
import { logger } from '../config/logger';

async function logJob(
  jobName: string,
  fn: () => Promise<{ processed: number; details?: unknown }>
) {
  const start = Date.now();
  try {
    const result = await fn();
    await prisma.automationLog.create({
      data: {
        jobName,
        status: 'SUCCESS',
        details: result as object,
      },
    });
    logger.info(`Job [${jobName}] completed in ${Date.now() - start}ms`, result);
  } catch (err) {
    await prisma.automationLog.create({
      data: {
        jobName,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    logger.error(`Job [${jobName}] failed`, { err });
  }
}

// ─── Job: Send payment reminders ──────────────
// Runs days 1, 3, 5 of each month at 9am
async function sendPaymentReminders(day: number) {
  return logJob(`payment_reminder_day${day}`, async () => {
    const delinquent = await PaymentService.getDelinquentStudents();
    let processed = 0;

    for (const student of delinquent) {
      await WhatsAppAdapter.send({
        to: student.phone,
        studentId: student.id,
        body: templates.paymentReminder(student.name, day),
        type: `REMINDER_DAY${day}`,
      });
      processed++;
      // Rate limit: 1 msg/sec to avoid Twilio throttle
      await new Promise((r) => setTimeout(r, 1000));
    }

    return { processed };
  });
}

// ─── Job: Release slots for non-payers ────────
// Runs on day 6 at midnight
async function releaseDelinquentSlots() {
  return logJob('release_delinquent_slots', async () => {
    const delinquent = await PaymentService.getDelinquentStudents();
    let processed = 0;

    for (const student of delinquent) {
      // Mark delinquent first, then suspend (releases slots)
      await StudentService.markDelinquent(student.id);
      await StudentService.suspend(student.id);

      // Notify next on waiting list for their schedule
      for (const slot of student.scheduleSlots) {
        await notifyWaitingList(slot.scheduleId);
      }
      processed++;
    }

    return { processed };
  });
}

// ─── Helper: notify first on waiting list ─────
async function notifyWaitingList(scheduleId: string) {
  const next = await prisma.waitingList.findFirst({
    where: { scheduleId, confirmedAt: null, skippedAt: null },
    orderBy: { position: 'asc' },
    include: {
      student: true,
      schedule: true,
    },
  });

  if (!next) return;

  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const scheduleStr = `${DAYS[next.schedule.dayOfWeek]} ${next.schedule.startTime}`;

  const respondBy = new Date();
  respondBy.setHours(respondBy.getHours() + 24);

  await prisma.waitingList.update({
    where: { id: next.id },
    data: { notifiedAt: new Date(), respondBy },
  });

  await WhatsAppAdapter.send({
    to: next.student.phone,
    studentId: next.student.id,
    body: templates.waitingListAvailable(next.student.name, scheduleStr),
    type: 'WAITING_LIST_AVAILABLE',
  });
}

// ─── Job: Expire waiting list responses ────────
// Runs every hour — skip those who didn't respond in 24h
async function expireWaitingListResponses() {
  return logJob('expire_waiting_list', async () => {
    const expired = await prisma.waitingList.findMany({
      where: {
        notifiedAt: { not: null },
        respondBy: { lt: new Date() },
        confirmedAt: null,
        skippedAt: null,
      },
    });

    let processed = 0;
    for (const entry of expired) {
      await prisma.waitingList.update({
        where: { id: entry.id },
        data: { skippedAt: new Date() },
      });
      await notifyWaitingList(entry.scheduleId);
      processed++;
    }

    return { processed };
  });
}

// ─── Register all cron jobs ────────────────────
export function registerAutomations() {
  // Reminders: day 1, 3, 5 at 9:00 AM
  cron.schedule('0 9 1 * *', () => sendPaymentReminders(1));
  cron.schedule('0 9 3 * *', () => sendPaymentReminders(3));
  cron.schedule('0 9 5 * *', () => sendPaymentReminders(5));

  // Release slots: day 6 at 00:05
  cron.schedule('5 0 6 * *', () => releaseDelinquentSlots());

  // Expire waiting list hourly
  cron.schedule('0 * * * *', () => expireWaitingListResponses());

  logger.info('Automation cron jobs registered');
}
