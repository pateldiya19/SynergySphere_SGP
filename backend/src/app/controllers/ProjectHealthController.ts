import { Response } from 'express';
import { param } from 'express-validator';
import { Project, Task, TaskHistory, Thread } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { calculateProjectHealth } from '@/services/ProjectHealthService';
import { ResponseUtils } from '@/utils';

export class ProjectHealthController {
  static validation = [param('id').isMongoId().withMessage('Invalid project ID')];

  static async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const project = (await Project.findOne({
        _id: req.params.id,
        isActive: true,
        $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
      })
        .populate('members.userId', 'name')
        .lean()) as any;

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const [tasks, lastHistory, lastDiscussion] = await Promise.all([
        Task.find({ projectId: project._id })
          .select(
            'title taskKey status priority dueDate assigneeId dependencies createdAt updatedAt'
          )
          .populate('assigneeId', 'name')
          .populate('dependencies', 'status')
          .lean(),
        TaskHistory.findOne({ projectId: project._id })
          .sort({ createdAt: -1 })
          .select('createdAt')
          .lean(),
        Thread.findOne({ projectId: project._id })
          .sort({ updatedAt: -1 })
          .select('updatedAt')
          .lean(),
      ]);

      ResponseUtils.success(
        res,
        calculateProjectHealth({
          tasks: tasks as any[],
          members: project.members,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          lastHistoryAt: lastHistory?.createdAt,
          lastDiscussionAt: lastDiscussion?.updatedAt,
        }),
        'Project health retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
