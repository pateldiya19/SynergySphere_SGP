import { Response } from 'express';
import { body, param } from 'express-validator';
import { Project, Reply, Thread } from '@/models';
import { ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';
import { emitToProject } from '@/infrastructure/socket';
import { NotificationService } from '@/services/NotificationService';

type AnyRecord = Record<string, any>;

export class DiscussionController {
  // Validation rules
  static projectParamValidation = [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
  ];

  static threadParamValidation = [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
    param('threadId').isMongoId().withMessage('Invalid discussion ID'),
  ];

  static createThreadValidation = [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Thread title is required and cannot exceed 200 characters'),
    body('body')
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Thread body is required and cannot exceed 2000 characters'),
  ];

  static createReplyValidation = [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
    param('threadId').isMongoId().withMessage('Invalid discussion ID'),
    body('body')
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message body is required and cannot exceed 2000 characters'),
  ];

  /**
   * A user may read/post in a project discussion when they own the project or
   * are listed as a member of it.
   */
  private static async findAccessibleProject(
    projectId: string,
    userId: string
  ): Promise<AnyRecord | null> {
    return Project.findOne({
      _id: projectId,
      $or: [{ ownerId: userId }, { 'members.userId': userId }],
      isActive: true,
    }).lean() as Promise<AnyRecord | null>;
  }

  private static serializeAuthored(document: AnyRecord): AnyRecord {
    const author = document.authorId as AnyRecord;
    const authorIsPopulated = Boolean(author?._id);

    return {
      ...document,
      id: document._id.toString(),
      author: authorIsPopulated ? { ...author, id: author._id.toString() } : undefined,
      authorId: authorIsPopulated ? author._id.toString() : String(document.authorId),
    };
  }

  /** Fan out a notification to every project member except the acting user. */
  private static async notifyMembers(
    project: AnyRecord,
    actingUserId: string,
    type: 'thread_new' | 'reply_new',
    title: string,
    message: string,
    payload: AnyRecord
  ): Promise<void> {
    try {
      const recipientIds = new Set<string>();
      recipientIds.add(String(project.ownerId));
      for (const member of project.members || []) {
        recipientIds.add(String(member.userId));
      }
      recipientIds.delete(actingUserId);

      if (recipientIds.size === 0) return;

      await NotificationService.createMany(
        [...recipientIds].map(userId => ({ userId, type, title, message, payload }))
      );
    } catch (error: any) {
      // Notifications are best-effort; never fail the discussion request over them.
      // NotificationService is best-effort and does not fail the discussion request.
    }
  }

  /** GET /api/discussions/project/:projectId - all threads with their messages */
  static async getProjectThreads(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user._id.toString();

      const project = await DiscussionController.findAccessibleProject(projectId, userId);
      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const threads = (await Thread.find({ projectId })
        .sort({ lastReplyAt: -1, createdAt: -1 })
        .populate('authorId', 'name email avatarUrl')
        .lean()) as AnyRecord[];

      const threadIds = threads.map(thread => thread._id);
      const replies = (await Reply.find({ threadId: { $in: threadIds } })
        .sort({ createdAt: 1 })
        .populate('authorId', 'name email avatarUrl')
        .lean()) as AnyRecord[];

      const repliesByThread = new Map<string, AnyRecord[]>();
      for (const reply of replies) {
        const key = reply.threadId.toString();
        const list = repliesByThread.get(key) || [];
        list.push(DiscussionController.serializeAuthored(reply));
        repliesByThread.set(key, list);
      }

      const result = threads.map(thread => ({
        ...DiscussionController.serializeAuthored(thread),
        replies: repliesByThread.get(thread._id.toString()) || [],
      }));

      ResponseUtils.success(res, result, 'Project discussions retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  /** POST /api/discussions/project/:projectId - start a new discussion thread */
  static async createThread(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { title, body } = req.body;
      const userId = req.user._id;

      const project = await DiscussionController.findAccessibleProject(
        projectId,
        userId.toString()
      );
      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const thread = await Thread.create({
        projectId,
        title,
        authorId: userId,
        replyCount: 1,
        lastReplyAt: new Date(),
      });

      const firstReply = await Reply.create({
        threadId: thread._id,
        authorId: userId,
        body,
      });

      const [populatedThread, populatedReply] = await Promise.all([
        Thread.findById(thread._id)
          .populate('authorId', 'name email avatarUrl')
          .lean() as Promise<AnyRecord>,
        Reply.findById(firstReply._id)
          .populate('authorId', 'name email avatarUrl')
          .lean() as Promise<AnyRecord>,
      ]);

      const payload = {
        ...DiscussionController.serializeAuthored(populatedThread),
        replies: [DiscussionController.serializeAuthored(populatedReply)],
      };

      emitToProject(projectId, 'discussion:thread-created', { projectId, thread: payload });

      await DiscussionController.notifyMembers(
        project,
        userId.toString(),
        'thread_new',
        'New discussion started',
        `${req.user.name} started "${title}" in ${project.name}`,
        { projectId, threadId: String(thread._id) }
      );

      ResponseUtils.created(res, payload, 'Discussion created successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  /** GET /api/discussions/project/:projectId/:threadId/replies - message history */
  static async getThreadReplies(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, threadId } = req.params;
      const userId = req.user._id.toString();

      const project = await DiscussionController.findAccessibleProject(projectId, userId);
      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const thread = await Thread.findOne({ _id: threadId, projectId }).lean();
      if (!thread) {
        ResponseUtils.notFound(res, 'Discussion not found or access denied');
        return;
      }

      const replies = (await Reply.find({ threadId })
        .sort({ createdAt: 1 })
        .populate('authorId', 'name email avatarUrl')
        .lean()) as AnyRecord[];

      ResponseUtils.success(
        res,
        replies.map(reply => DiscussionController.serializeAuthored(reply)),
        'Discussion replies retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  /** POST /api/discussions/project/:projectId/:threadId/replies - send a message */
  static async createReply(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId, threadId } = req.params;
      const { body } = req.body;
      const userId = req.user._id;

      const project = await DiscussionController.findAccessibleProject(
        projectId,
        userId.toString()
      );
      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const thread = (await Thread.findOne({
        _id: threadId,
        projectId,
      }).lean()) as AnyRecord | null;
      if (!thread) {
        ResponseUtils.notFound(res, 'Discussion not found or access denied');
        return;
      }

      const reply = await Reply.create({
        threadId,
        authorId: userId,
        body,
      });

      await Thread.findByIdAndUpdate(threadId, {
        $inc: { replyCount: 1 },
        lastReplyAt: new Date(),
      });

      const populatedReply = (await Reply.findById(reply._id)
        .populate('authorId', 'name email avatarUrl')
        .lean()) as AnyRecord;

      const payload = DiscussionController.serializeAuthored(populatedReply);

      emitToProject(projectId, 'discussion:reply-created', { projectId, threadId, reply: payload });

      await DiscussionController.notifyMembers(
        project,
        userId.toString(),
        'reply_new',
        'New message in a discussion',
        `${req.user.name} replied to "${thread.title}"`,
        { projectId, threadId }
      );

      ResponseUtils.created(res, payload, 'Reply added successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
