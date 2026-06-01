import cron from 'node-cron';
import { logger } from '../config/logger';
import { runPaymentReminders } from './payment-reminder.service';

/**
 * Register all cron jobs.
 * Called once at server startup after Redis/DB are ready.
 */
export function registerAutomations(): void {

  // Payment reminders — runs every day at 9:00 AM
  // Sends reminder to students whose paymentDay is within ±5 days of today
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Cron] Running payment reminders...');
    await runPaymentReminders().catch(err =>
      logger.error('[Cron] Payment reminder error', { err })
    );
  }, { timezone: 'America/Mexico_City' });

  logger.info('[Cron] Automations registered — payment reminders at 9:00 AM daily');
}
