import { Response } from 'express';
import { query } from 'express-validator';
import { Project, Task, User } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { ResponseUtils } from '@/utils';

type SearchType = 'all' | 'users' | 'projects' | 'tasks';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageInfo(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

export class SearchController {
  static validation = [
    query('q')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),
    query('type')
      .optional()
      .isIn(['all', 'users', 'projects', 'tasks'])
      .withMessage('Invalid search type'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
  ];

  static async search(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const searchQuery = String(req.query.q).trim();
      const type = (req.query.type || 'all') as SearchType;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      // Escaped above, so this is a literal substring match.
      // eslint-disable-next-line security/detect-non-literal-regexp
      const searchRegex = new RegExp(escapeRegex(searchQuery), 'i');
      const userId = req.user._id;

      const result: {
        users: unknown[];
        projects: unknown[];
        tasks: unknown[];
      } = { users: [], projects: [], tasks: [] };
      const pagination: Record<string, unknown> = { page, limit };

      if (type === 'users' || type === 'all') {
        const userFilter = {
          isActive: true,
          $or: [{ name: searchRegex }, { email: searchRegex }],
        };
        const [users, total] = await Promise.all([
          User.find(userFilter)
            .select('name email avatarUrl isActive lastSeen')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          User.countDocuments(userFilter),
        ]);
        result.users = users;
        pagination.users = pageInfo(page, limit, total);
      }

      let accessibleProjectIds: unknown[] = [];
      if (type === 'projects' || type === 'tasks' || type === 'all') {
        const accessFilter = {
          $or: [{ ownerId: userId }, { 'members.userId': userId }],
          isActive: true,
        };
        accessibleProjectIds = await Project.find(accessFilter).distinct('_id');

        if (type === 'projects' || type === 'all') {
          const projectFilter = {
            _id: { $in: accessibleProjectIds },
            isActive: true,
            $or: [{ name: searchRegex }, { description: searchRegex }, { tags: searchRegex }],
          };
          const [projects, total] = await Promise.all([
            Project.find(projectFilter)
              .select('name description ownerId members tags deadline github createdAt updatedAt')
              .sort({ updatedAt: -1 })
              .skip(skip)
              .limit(limit)
              .populate('ownerId', 'name email avatarUrl')
              .lean(),
            Project.countDocuments(projectFilter),
          ]);
          result.projects = projects;
          pagination.projects = pageInfo(page, limit, total);
        }
      }

      if (type === 'tasks' || type === 'all') {
        const taskFilter = {
          projectId: { $in: accessibleProjectIds },
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { taskKey: searchRegex },
            { tags: searchRegex },
          ],
        };
        const [tasks, total] = await Promise.all([
          Task.find(taskFilter)
            .select(
              'projectId taskKey title description assigneeId dueDate status priority tags createdAt updatedAt'
            )
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('projectId', 'name')
            .populate('assigneeId', 'name email avatarUrl')
            .lean(),
          Task.countDocuments(taskFilter),
        ]);
        result.tasks = tasks;
        pagination.tasks = pageInfo(page, limit, total);
      }

      ResponseUtils.successWithPagination(
        res,
        result,
        pagination,
        'Search results retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
