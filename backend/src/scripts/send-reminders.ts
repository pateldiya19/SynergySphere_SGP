/**
 * Run the due-soon / overdue reminder sweep once and exit.
 *
 * The server runs this automatically every 15 minutes; this script exists so a
 * sweep can be triggered on demand -- useful during a demo, where waiting for
 * the next tick is not an option.
 *
 *   npm run notify:due
 *
 * Safe to run repeatedly: a task that has already been reminded about is
 * skipped, so this will not spam anyone.
 */
import Database from '@/config/database';
import { TaskReminderService } from '@/services/TaskReminderService';

async function main() {
  const database = Database.getInstance();
  await database.connect();

  const result = await TaskReminderService.runSweep();

  console.log('\n=== Reminder sweep complete ===');
  console.log(`  Due-soon notifications sent: ${result.due}`);
  console.log(`  Overdue notifications sent:  ${result.overdue}`);
  if (!result.due && !result.overdue) {
    console.log('\n  Nothing to send: every task that qualifies has already been');
    console.log('  reminded about, or no open task has a due date in range.');
  }

  await database.disconnect();
}

void main().catch(error => {
  console.error('Reminder sweep failed:', error);
  process.exit(1);
});
