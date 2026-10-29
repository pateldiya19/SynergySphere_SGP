import { Response } from 'express';
import { param, query } from 'express-validator';
import { Project, Reply, TaskHistory, Thread } from '@/models';
import { ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';

type AnyRecord = Record<string, any>;

const idOf = (value: any): string => String(value?._id || value?.id || value);

export class ProjectActivityController {
  static validation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
  ];

  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id: projectId } = req.params;
      const project = (await Project.findOne({
        _id: projectId,
        isActive: true,
        $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
      })
        .populate('ownerId', 'name email avatarUrl')
        .lean()) as AnyRecord | null;

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const take = page * limit;
      const [history, threads, allThreadIds, replyCount, historyCount, threadCount] =
        await Promise.all([
          TaskHistory.find({ projectId })
            .sort({ createdAt: -1 })
            .limit(take)
            .populate('actorId', 'name email avatarUrl')
            .populate('taskId', 'taskKey title')
            .lean() as Promise<AnyRecord[]>,
          Thread.find({ projectId })
            .sort({ createdAt: -1 })
            .limit(take)
            .populate('authorId', 'name email avatarUrl')
            .lean() as Promise<AnyRecord[]>,
          Thread.find({ projectId }).select('_id').lean(),
          Reply.countDocuments({
            threadId: { $in: await Thread.find({ projectId }).distinct('_id') },
          }),
          TaskHistory.countDocuments({ projectId }),
          Thread.countDocuments({ projectId }),
        ]);

      const replies = (await Reply.find({
        threadId: { $in: allThreadIds.map(thread => thread._id) },
      })
        .sort({ createdAt: -1 })
        .limit(take)
        .populate('authorId', 'name email avatarUrl')
        .populate('threadId', 'title')
        .lean()) as AnyRecord[];

      const actor = (value: any): AnyRecord | undefined =>
        value?._id
          ? { id: idOf(value), name: value.name, email: value.email, avatarUrl: value.avatarUrl }
          : undefined;
      const task = (value: any): AnyRecord | undefined =>
        value?._id ? { id: idOf(value), taskKey: value.taskKey, title: value.title } : undefined;
      const events: AnyRecord[] = [];

      events.push({
        id: `${projectId}:created`,
        projectId,
        eventType: 'PROJECT_CREATED',
        source: 'user',
        description: 'Project created',
        actor: actor(project.ownerId),
        timestamp: project.createdAt,
      });
      if (
        project.updatedAt &&
        new Date(project.updatedAt).getTime() > new Date(project.createdAt).getTime()
      ) {
        events.push({
          id: `${projectId}:updated:${new Date(project.updatedAt).getTime()}`,
          projectId,
          eventType: 'PROJECT_UPDATED',
          source: 'user',
          description: 'Project updated',
          actor: actor(project.ownerId),
          timestamp: project.updatedAt,
        });
      }

      for (const item of history) {
        events.push({
          id: idOf(item),
          projectId,
          eventType: item.type,
          source: item.source,
          description: item.description,
          actor: actor(item.actorId),
          task: task(item.taskId),
          timestamp: item.createdAt,
          metadata: item.metadata,
          changes: item.changes,
        });
      }
      for (const thread of threads) {
        events.push({
          id: `thread:${idOf(thread)}`,
          projectId,
          eventType: 'DISCUSSION_THREAD_CREATED',
          source: 'user',
          description: `Discussion started: ${thread.title}`,
          actor: actor(thread.authorId),
          timestamp: thread.createdAt,
          metadata: { threadId: idOf(thread) },
        });
      }
      for (const reply of replies) {
        events.push({
          id: `reply:${idOf(reply)}`,
          projectId,
          eventType: 'DISCUSSION_REPLY_CREATED',
          source: 'user',
          description: `Reply added to: ${reply.threadId?.title || 'discussion'}`,
          actor: actor(reply.authorId),
          timestamp: reply.createdAt,
          metadata: { threadId: idOf(reply.threadId) },
        });
      }

      events.sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
      const total =
        historyCount +
        threadCount +
        replyCount +
        (project.updatedAt &&
        new Date(project.updatedAt).getTime() > new Date(project.createdAt).getTime()
          ? 2
          : 1);
      ResponseUtils.paginated(
        res,
        events.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total,
        'Project activity retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
