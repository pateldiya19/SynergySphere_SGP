import { Response } from 'express';
import { param } from 'express-validator';
import { Project, Task, TaskHistory } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { ResponseUtils } from '@/utils';

type AnalyticsRecord = Record<string, any>;

export class ProjectAnalyticsController {
  static validation = [param('id').isMongoId().withMessage('Invalid project ID')];

  static async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const project = (await Project.findOne({
        _id: req.params.id,
        isActive: true,
        $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
      })
        .populate('members.userId', 'name email avatarUrl')
        .lean()) as AnalyticsRecord | null;

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const projectId = project._id;
      const [taskStats, completionTrend] = await Promise.all([
        Task.aggregate([
          { $match: { projectId } },
          {
            $facet: {
              totals: [{ $count: 'total' }],
              statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
              priorities: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
              assignees: [
                {
                  $group: {
                    _id: '$assigneeId',
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
                  },
                },
              ],
              overdue: [
                { $match: { dueDate: { $lt: new Date() }, status: { $ne: 'done' } } },
                { $count: 'total' },
              ],
            },
          },
        ]),
        TaskHistory.aggregate([
          {
            $match: {
              projectId,
              type: 'TASK_COMPLETED',
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      const stats = taskStats[0] || {};
      const statusCounts = new Map<string, number>(
        (stats.statuses || []).map((item: AnalyticsRecord) => [item._id, item.count])
      );
      const priorityCounts = new Map<string, number>(
        (stats.priorities || []).map((item: AnalyticsRecord) => [item._id, item.count])
      );
      const memberById = new Map<string, AnalyticsRecord>(
        (project.members || []).map((member: AnalyticsRecord) => [
          String(member.userId?._id || member.userId),
          member.userId,
        ])
      );
      const assigneeStats = (stats.assignees || [])
        .map((item: AnalyticsRecord) => {
          const member = item._id ? memberById.get(String(item._id)) : undefined;
          return {
            assignee: member
              ? {
                  id: String(member._id),
                  name: member.name,
                  email: member.email,
                  avatarUrl: member.avatarUrl,
                }
              : item._id
                ? { id: String(item._id), name: 'Project member', email: '' }
                : null,
            total: item.total,
            completed: item.completed,
          };
        })
        .sort((left: AnalyticsRecord, right: AnalyticsRecord) => right.total - left.total);

      const memberWorkload = (project.members || []).map((member: AnalyticsRecord) => {
        const memberId = String(member.userId?._id || member.userId);
        const assigned = assigneeStats.find(
          (item: AnalyticsRecord) => item.assignee?.id === memberId
        );
        return {
          member: {
            id: memberId,
            name: member.userId?.name || 'Project member',
            email: member.userId?.email || '',
            avatarUrl: member.userId?.avatarUrl,
            role: member.role,
          },
          assignedTasks: assigned?.total || 0,
          completedTasks: assigned?.completed || 0,
        };
      });

      const totalTasks = stats.totals?.[0]?.total || 0;
      const completedTasks = statusCounts.get('done') || 0;
      ResponseUtils.success(
        res,
        {
          totalTasks,
          completedTasks,
          inProgressTasks: statusCounts.get('in_progress') || 0,
          blockedTasks: statusCounts.get('blocked') || 0,
          readyForReviewTasks: statusCounts.get('ready_for_review') || 0,
          changesRequestedTasks: statusCounts.get('changes_requested') || 0,
          todoTasks: statusCounts.get('todo') || 0,
          completionPercentage: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
          overdueTasks: stats.overdue?.[0]?.total || 0,
          tasksByPriority: ['urgent', 'high', 'medium', 'low'].map(priority => ({
            priority,
            count: priorityCounts.get(priority) || 0,
          })),
          tasksByAssignee: assigneeStats,
          completionOverTime: completionTrend.map((item: AnalyticsRecord) => ({
            date: item._id,
            count: item.count,
          })),
          memberWorkload,
        },
        'Project analytics retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
