import cron from 'node-cron';
import { logger } from '../config/logger';
import { runPaymentReminders } from './payment-reminder.service';
import { suspendDelinquentStudents } from './suspension.service';
import { expireWaitlistOffers } from './waitlist.service';

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

  // Suspend delinquent students on day 6 at 00:05
  cron.schedule('5 0 6 * *', async () => {
    logger.info('[Cron] Running suspension of delinquent students...');
    await suspendDelinquentStudents().catch(err =>
      logger.error('[Cron] Suspension error', { err })
    );
  }, { timezone: 'America/Mexico_City' });

  // Also check suspension daily as backup
  cron.schedule('10 0 * * *', async () => {
    await suspendDelinquentStudents().catch(err =>
      logger.error('[Cron] Suspension backup error', { err })
    );
  }, { timezone: 'America/Mexico_City' });

  // Expire waitlist offers after 24 hours - check every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('[Cron] Checking waitlist expirations...');
    await expireWaitlistOffers().catch(err =>
      logger.error('[Cron] Waitlist expiration error', { err })
    );
  }, { timezone: 'America/Mexico_City' });

  logger.info('[Cron] Automations registered — payment reminders at 9:00 AM daily, suspension day 6 + daily backup, waitlist expiration hourly');
}
