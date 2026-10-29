import { Response } from 'express';
import { body, param } from 'express-validator';
import { Task, TaskComment } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { NotificationService } from '@/services/NotificationService';
import { emitToProject } from '@/infrastructure/socket';
import { ResponseUtils } from '@/utils';

const AUTHOR_FIELDS = 'name email avatarUrl';

/**
 * Load a task the caller is allowed to see, with its project populated.
 *
 * Returns null for both "no such task" and "not a member", so callers answer
 * 404 either way and the endpoint does not reveal which projects exist.
 */
async function findAccessibleTask(taskId: string, userId: string): Promise<any | null> {
  const task = await Task.findById(taskId).populate('projectId', 'name ownerId members isActive');
  if (!task) return null;

  const project = task.projectId as any;
  const isMember =
    project?.isActive &&
    (String(project.ownerId) === userId ||
      project.members.some((member: any) => String(member.userId) === userId));

  return isMember ? task : null;
}

/** Project owners and managers may moderate; everyone may manage their own. */
function canModerate(project: any, userId: string): boolean {
  if (String(project.ownerId) === userId) return true;
  return project.members.some(
    (member: any) => String(member.userId) === userId && member.role === 'manager'
  );
}

export class TaskCommentController {
  static taskIdValidation = [param('id').isMongoId().withMessage('Invalid task ID')];

  static commentIdValidation = [
    param('id').isMongoId().withMessage('Invalid task ID'),
    param('commentId').isMongoId().withMessage('Invalid comment ID'),
  ];

  static bodyValidation = [
    body('body')
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('A comment must be between 1 and 2000 characters'),
  ];

  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findAccessibleTask(req.params.id, String(req.user._id));
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }

      const comments = await TaskComment.find({ taskId: task._id })
        .populate('authorId', AUTHOR_FIELDS)
        .sort({ createdAt: 1 });

      ResponseUtils.success(res, comments, 'Comments retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findAccessibleTask(req.params.id, String(req.user._id));
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }

      const project = task.projectId as any;
      const projectId = String(project._id);
      const taskId = String(task._id);
      const authorId = String(req.user._id);

      const created = await TaskComment.create({
        taskId: task._id,
        projectId: project._id,
        authorId: req.user._id,
        body: req.body.body,
      });

      const comment = await TaskComment.findById(created._id).populate('authorId', AUTHOR_FIELDS);

      // Everyone with a stake in the task hears about it, minus the author.
      const recipients = new Set<string>();
      if (task.assigneeId) recipients.add(String(task.assigneeId));
      recipients.add(String(project.ownerId));
      for (const member of project.members || []) {
        if (member.role === 'manager') recipients.add(String(member.userId));
      }
      recipients.delete(authorId);

      await NotificationService.createMany(
        [...recipients].map(userId => ({
          userId,
          type: 'task_comment' as const,
          title: 'New comment',
          message: `${req.user.name} commented on "${task.title}"`,
          payload: { projectId, taskId, taskKey: task.taskKey },
        }))
      );

      emitToProject(projectId, 'task:comment-added', { projectId, taskId, comment });
      ResponseUtils.created(res, comment, 'Comment added successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findAccessibleTask(req.params.id, String(req.user._id));
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }

      const comment = await TaskComment.findOne({
        _id: req.params.commentId,
        taskId: task._id,
      });
      if (!comment) {
        ResponseUtils.notFound(res, 'Comment not found');
        return;
      }

      // Editing is the author's alone: a manager may remove a comment but must
      // not be able to put words in someone else's mouth.
      if (String(comment.authorId) !== String(req.user._id)) {
        ResponseUtils.forbidden(res, 'Only the author can edit a comment');
        return;
      }

      comment.body = req.body.body;
      comment.editedAt = new Date();
      await comment.save();

      const updated = await TaskComment.findById(comment._id).populate('authorId', AUTHOR_FIELDS);

      const projectId = String((task.projectId as any)._id);
      emitToProject(projectId, 'task:comment-updated', {
        projectId,
        taskId: String(task._id),
        comment: updated,
      });
      ResponseUtils.success(res, updated, 'Comment updated successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async remove(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findAccessibleTask(req.params.id, String(req.user._id));
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }

      const comment = await TaskComment.findOne({
        _id: req.params.commentId,
        taskId: task._id,
      });
      if (!comment) {
        ResponseUtils.notFound(res, 'Comment not found');
        return;
      }

      const userId = String(req.user._id);
      const isAuthor = String(comment.authorId) === userId;
      if (!isAuthor && !canModerate(task.projectId as any, userId)) {
        ResponseUtils.forbidden(res, 'Only the author or a project manager can delete a comment');
        return;
      }

      await comment.deleteOne();

      const projectId = String((task.projectId as any)._id);
      emitToProject(projectId, 'task:comment-deleted', {
        projectId,
        taskId: String(task._id),
        commentId: String(comment._id),
      });
      ResponseUtils.success(res, null, 'Comment deleted successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
