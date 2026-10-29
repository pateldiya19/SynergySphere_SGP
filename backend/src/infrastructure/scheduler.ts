import { TaskReminderService } from '@/services/TaskReminderService';
import { logger } from '@/utils';

/** How often the reminder sweep runs once the server is up. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/** Short delay after boot so the first sweep does not compete with startup. */
const INITIAL_DELAY_MS = 10 * 1000;

let interval: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;

async function runSweepSafely(): Promise<void> {
  try {
    await TaskReminderService.runSweep();
  } catch (error: any) {
    // A failed sweep must never take the server down: the tasks it did not
    // claim stay unclaimed and the next run picks them up.
    logger.error(`Task reminder sweep failed: ${error.message}`);
  }
}

/**
 * Start the background reminder sweep.
 *
 * Deliberately a plain interval rather than a cron library or job queue: the
 * job is idempotent, runs in-process, and losing a tick costs nothing because
 * the next sweep re-finds the same tasks.
 */
export function startScheduler(): void {
  if (interval) return;

  initialTimer = setTimeout(() => {
    void runSweepSafely();
  }, INITIAL_DELAY_MS);

  interval = setInterval(() => {
    void runSweepSafely();
  }, SWEEP_INTERVAL_MS);

  // Do not hold the event loop open on shutdown.
  initialTimer.unref?.();
  interval.unref?.();

  logger.info(`Task reminder scheduler started (every ${SWEEP_INTERVAL_MS / 60000} minutes)`);
}

export function stopScheduler(): void {
  if (initialTimer) clearTimeout(initialTimer);
  if (interval) clearInterval(interval);
  initialTimer = null;
  interval = null;
}
