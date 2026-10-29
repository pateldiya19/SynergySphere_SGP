import { Response } from 'express';
import { Notification, Project, Reply, Task, TaskHistory, Thread } from '@/models';
import { ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';
import { NotificationService } from '@/services/NotificationService';

export class DashboardController {
  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user._id;
      const projects = (await Project.find({
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        isActive: true,
      })
        .sort({ updatedAt: -1 })
        .limit(20)
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl')
        .lean()) as any[];

      const projectIds = projects.map(project => project._id);
      const [tasks, history, threads, notifications] = await Promise.all([
        Task.find({ projectId: { $in: projectIds }, assigneeId: userId })
          .sort({ dueDate: 1, updatedAt: -1 })
          .limit(20)
          .populate('projectId', 'name')
          .lean(),
        TaskHistory.find({ projectId: { $in: projectIds } })
          .sort({ createdAt: -1 })
          .limit(12)
          .populate('actorId', 'name email avatarUrl')
          .populate('taskId', 'taskKey title')
          .populate('projectId', 'name')
          .lean() as any,
        Thread.find({ projectId: { $in: projectIds } })
          .sort({ updatedAt: -1 })
          .limit(6)
          .populate('authorId', 'name email avatarUrl')
          .populate('projectId', 'name')
          .lean() as any,
        Notification.find({ userId }).sort({ createdAt: -1 }).limit(8).lean(),
      ]);
      const replies = (await Reply.find({
        threadId: { $in: threads.map((thread: any) => thread._id) },
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('authorId', 'name email avatarUrl')
        .populate('threadId', 'title projectId')
        .lean()) as any[];

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const overdueTasks = tasks.filter(
        (task: any) => task.status !== 'done' && task.dueDate && new Date(task.dueDate) < startOfDay
      );
      if (overdueTasks.length > 0) {
        const overdueTaskIds = overdueTasks.map((task: any) => String(task._id));
        const notifiedTasks = await Notification.find({
          userId,
          type: 'task_overdue',
          'payload.taskId': { $in: overdueTaskIds },
          createdAt: { $gte: startOfDay },
        })
          .select('payload.taskId')
          .lean();
        const notifiedTaskIds = new Set(
          notifiedTasks.map((notification: any) => String(notification.payload?.taskId))
        );
        await NotificationService.createMany(
          overdueTasks
            .filter((task: any) => !notifiedTaskIds.has(String(task._id)))
            .map((task: any) => ({
              userId: String(userId),
              type: 'task_overdue' as const,
              title: 'Task overdue',
              message: `${task.title} is overdue${task.projectId?.name ? ` in ${task.projectId.name}` : ''}`,
              payload: {
                projectId: String(task.projectId?._id || task.projectId),
                taskId: String(task._id),
                taskKey: task.taskKey,
                dueDate: task.dueDate,
              },
            }))
        );
      }

      const allTasks = await Task.find({ projectId: { $in: projectIds } })
        .select('projectId status')
        .lean();
      const taskTotals = new Map<string, { total: number; done: number; open: number }>();
      for (const task of allTasks) {
        const projectId = String(task.projectId);
        const current = taskTotals.get(projectId) || { total: 0, done: 0, open: 0 };
        current.total += 1;
        if (task.status === 'done') current.done += 1;
        else current.open += 1;
        taskTotals.set(projectId, current);
      }

      const activities: any[] = history.map((item: any) => ({
        id: String(item._id),
        projectId: String(item.projectId?._id || item.projectId),
        project: item.projectId?.name,
        task: item.taskId
          ? { id: String(item.taskId._id), taskKey: item.taskId.taskKey, title: item.taskId.title }
          : undefined,
        eventType: item.type,
        source: item.source,
        description: item.description,
        actor: item.actorId,
        timestamp: item.createdAt,
      }));

      for (const thread of threads) {
        activities.push({
          id: `thread:${String(thread._id)}`,
          projectId: String(thread.projectId?._id || thread.projectId),
          project: thread.projectId?.name,
          eventType: 'DISCUSSION_THREAD_CREATED',
          source: 'user',
          description: `Discussion started: ${thread.title}`,
          actor: thread.authorId,
          timestamp: thread.createdAt,
        });
      }

      for (const reply of replies) {
        activities.push({
          id: `reply:${String(reply._id)}`,
          projectId: String(reply.threadId?.projectId || ''),
          project: projects.find(
            project => String(project._id) === String(reply.threadId?.projectId)
          )?.name,
          eventType: 'DISCUSSION_REPLY_CREATED',
          source: 'user',
          description: `Reply added to: ${reply.threadId?.title || 'discussion'}`,
          actor: reply.authorId,
          timestamp: reply.createdAt,
        });
      }

      activities.sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );

      ResponseUtils.success(
        res,
        {
          tasks,
          projects: projects.map(project => ({
            ...project,
            id: String(project._id),
            taskProgress: taskTotals.get(String(project._id)) || { total: 0, done: 0, open: 0 },
          })),
          activities: activities.slice(0, 12),
          notifications,
        },
        'Dashboard retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
