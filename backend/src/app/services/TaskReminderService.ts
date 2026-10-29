import { Task } from '@/models';
import { NotificationService } from '@/services/NotificationService';
import { logger } from '@/utils';

/** A task counts as "due soon" once its due date is within this window. */
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Statuses that still need doing; finished work is never reminded about. */
const OPEN_STATUSES = ['todo', 'in_progress', 'blocked', 'changes_requested'];

export type ReminderSweepResult = {
  due: number;
  overdue: number;
};

function formatDueDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export class TaskReminderService {
  /**
   * Notify assignees about work that is due soon or already late.
   *
   * Duplicate suppression is handled by the query rather than by checking for
   * an existing notification afterwards: each task is claimed with an atomic
   * `findOneAndUpdate` that only matches while the reminder stamp is unset, so
   * two overlapping sweeps cannot both claim the same task. The notification is
   * only created once the claim succeeds.
   */
  static async runSweep(now: Date = new Date()): Promise<ReminderSweepResult> {
    const result: ReminderSweepResult = { due: 0, overdue: 0 };

    result.overdue = await TaskReminderService.sweep({
      stampField: 'overdueReminderSentAt',
      filter: { dueDate: { $lt: now } },
      now,
      build: task => ({
        type: 'task_overdue' as const,
        title: 'Task overdue',
        message: `"${task.title}" was due on ${formatDueDate(task.dueDate)}.`,
      }),
    });

    result.due = await TaskReminderService.sweep({
      stampField: 'dueReminderSentAt',
      filter: { dueDate: { $gte: now, $lte: new Date(now.getTime() + DUE_SOON_WINDOW_MS) } },
      now,
      build: task => ({
        type: 'task_due' as const,
        title: 'Task due soon',
        message: `"${task.title}" is due on ${formatDueDate(task.dueDate)}.`,
      }),
    });

    if (result.due || result.overdue) {
      logger.info(`Task reminders sent: due_soon=${result.due} overdue=${result.overdue}`);
    }
    return result;
  }

  private static async sweep(options: {
    stampField: 'dueReminderSentAt' | 'overdueReminderSentAt';
    filter: Record<string, unknown>;
    now: Date;
    build: (task: any) => { type: 'task_due' | 'task_overdue'; title: string; message: string };
  }): Promise<number> {
    const { stampField, filter, now, build } = options;

    const baseFilter = {
      ...filter,
      status: { $in: OPEN_STATUSES },
      assigneeId: { $ne: null, $exists: true },
      [stampField]: { $exists: false },
    };

    let sent = 0;
    // Claim one task at a time so a failure part-way through leaves the rest
    // unclaimed and the next sweep picks them up.
    for (;;) {
      const task = await Task.findOneAndUpdate(
        baseFilter,
        { $set: { [stampField]: now } },
        { new: true }
      ).lean<any>();
      if (!task) break;

      const { type, title, message } = build(task);
      await NotificationService.create({
        userId: String(task.assigneeId),
        type,
        title,
        message,
        payload: {
          taskId: String(task._id),
          projectId: String(task.projectId),
          taskKey: task.taskKey,
          dueDate: task.dueDate,
        },
      });
      sent += 1;
    }

    return sent;
  }

  /**
   * Clear the stamps for a task whose due date moved, so the new date is
   * reminded about. Called from the task update path.
   */
  static async resetRemindersFor(taskId: string): Promise<void> {
    await Task.updateOne(
      { _id: taskId },
      { $unset: { dueReminderSentAt: 1, overdueReminderSentAt: 1 } }
    );
  }
}
