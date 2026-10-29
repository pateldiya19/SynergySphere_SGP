import { Response } from 'express';
import { body, param, query } from 'express-validator';
import { Project, Task } from '@/models';
import { QueryUtils, ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';
import { TaskStatus } from '@/types';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { NotificationService } from '@/services/NotificationService';
import { emitToProject } from '@/infrastructure/socket';

export class TaskController {
  // Validation rules
  static createValidation = [
    body('projectId').isMongoId().withMessage('Invalid project ID'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Task title is required and cannot exceed 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
    body('assigneeId').optional({ nullable: true }).isMongoId().withMessage('Invalid assignee ID'),
    body('dueDate')
      .optional({ nullable: true })
      .isISO8601()
      .withMessage('Due date must be a valid date'),
    body('status')
      .optional()
      .isIn(['todo', 'in_progress', 'blocked'])
      .withMessage('New tasks cannot be created in a review or completed status'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be low, medium, high, or urgent'),
    body('subtasks')
      .optional()
      .isArray({ max: 50 })
      .withMessage('Subtasks must be an array with at most 50 items'),
    body('subtasks.*.title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Subtask title is required and cannot exceed 200 characters'),
    body('subtasks.*.completed')
      .optional()
      .isBoolean()
      .withMessage('Subtask completion must be boolean'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
  ];

  static updateValidation = [
    param('id').isMongoId().withMessage('Invalid task ID'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Task title cannot exceed 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
    body('assigneeId').optional({ nullable: true }).isMongoId().withMessage('Invalid assignee ID'),
    body('dueDate')
      .optional({ nullable: true })
      .isISO8601()
      .withMessage('Due date must be a valid date'),
    body('status')
      .optional()
      .isIn(['todo', 'in_progress', 'blocked', 'ready_for_review', 'changes_requested', 'done'])
      .withMessage('Invalid task status'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be low, medium, high, or urgent'),
    body('subtasks')
      .optional()
      .isArray({ max: 50 })
      .withMessage('Subtasks must be an array with at most 50 items'),
    body('subtasks.*.title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Subtask title is required and cannot exceed 200 characters'),
    body('subtasks.*.completed')
      .optional()
      .isBoolean()
      .withMessage('Subtask completion must be boolean'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
  ];

  static getTasksValidation = [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
    query('status')
      .optional()
      .isIn(['todo', 'in_progress', 'blocked', 'ready_for_review', 'changes_requested', 'done'])
      .withMessage('Invalid task status'),
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid task priority'),
    query('assigneeId').optional().isMongoId().withMessage('Invalid assignee ID'),
    query('dueBefore').optional().isISO8601().withMessage('dueBefore must be a valid date'),
    query('dueAfter').optional().isISO8601().withMessage('dueAfter must be a valid date'),
    query('overdue').optional().isBoolean().withMessage('overdue must be a boolean'),
    query('sort')
      .optional()
      .isIn(['createdAt', 'dueDate', 'priority', 'title', 'status'])
      .withMessage('Invalid task sort'),
    query('order').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order'),
  ];

  static dependencyValidation = [
    param('id').isMongoId().withMessage('Invalid task ID'),
    body('dependencyTaskId').isMongoId().withMessage('Invalid dependency task ID'),
  ];

  static removeDependencyValidation = [
    param('id').isMongoId().withMessage('Invalid task ID'),
    param('dependencyId').isMongoId().withMessage('Invalid dependency task ID'),
  ];

  private static async createsDependencyCycle(
    projectId: any,
    taskId: string,
    dependencyId: string
  ): Promise<boolean> {
    const tasks = (await Task.find({ projectId }).select('_id dependencies').lean()) as any[];
    const dependencies = new Map<string, string[]>(
      tasks.map(task => [String(task._id), (task.dependencies || []).map((id: any) => String(id))])
    );
    const pending = [dependencyId];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(dependencies.get(current) || []));
    }
    return false;
  }

  private static async hasIncompleteDependencies(task: any): Promise<boolean> {
    if (!task.dependencies || task.dependencies.length === 0) return false;
    return Boolean(await Task.exists({ _id: { $in: task.dependencies }, status: { $ne: 'done' } }));
  }

  // Get all tasks for a project
  static async getTasks(req: any, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user._id;
      const queryOptions = QueryUtils.parseQueryOptions(req.query);

      // Check if user has access to the project
      const project = await Project.findOne({
        _id: projectId,
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        isActive: true,
      });

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      const query: any = { projectId };

      // Add search functionality
      if (queryOptions.search) {
        const searchQuery = QueryUtils.buildSearchQuery(queryOptions.search, [
          'title',
          'description',
        ]);
        Object.assign(query, searchQuery);
      }

      // Add status filter
      if (req.query.status) {
        query.status = req.query.status;
      }

      // Add assignee filter
      if (req.query.assigneeId) {
        query.assigneeId = req.query.assigneeId;
      }

      // Add priority filter
      if (req.query.priority) {
        query.priority = req.query.priority;
      }

      const dueDate: Record<string, Date> = {};
      if (req.query.dueAfter) dueDate.$gte = new Date(req.query.dueAfter);
      if (req.query.dueBefore) dueDate.$lte = new Date(req.query.dueBefore);
      if (req.query.overdue === 'true') {
        dueDate.$lt = new Date();
        query.status = { $ne: 'done' };
      }
      if (Object.keys(dueDate).length > 0) query.dueDate = dueDate;

      const skip = QueryUtils.calculateSkip(queryOptions.page!, queryOptions.limit!);
      const sort = QueryUtils.buildSortObject(queryOptions.sort!, queryOptions.order!);

      const [tasks, total] = await Promise.all([
        Task.find(query)
          .sort(sort)
          .skip(skip)
          .limit(queryOptions.limit!)
          .populate('assigneeId', 'name email avatarUrl github githubLogin')
          .populate('dependencies', 'taskKey title status')
          .lean(),
        Task.countDocuments(query),
      ]);

      ResponseUtils.paginated(
        res,
        tasks,
        queryOptions.page!,
        queryOptions.limit!,
        total,
        'Tasks retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Get tasks assigned to the current user
  static async getMyTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user._id;
      const queryOptions = QueryUtils.parseQueryOptions(req.query);

      const accessibleProjects = await Project.find({
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        isActive: true,
      }).select('_id');
      const query: any = {
        assigneeId: userId,
        projectId: { $in: accessibleProjects.map(project => project._id) },
      };

      // Add search functionality
      if (queryOptions.search) {
        const searchQuery = QueryUtils.buildSearchQuery(queryOptions.search, [
          'title',
          'description',
        ]);
        Object.assign(query, searchQuery);
      }

      // Add status filter
      if (req.query.status) {
        query.status = req.query.status;
      }

      // Add priority filter
      if (req.query.priority) {
        query.priority = req.query.priority;
      }

      const skip = QueryUtils.calculateSkip(queryOptions.page!, queryOptions.limit!);
      const sort = QueryUtils.buildSortObject(queryOptions.sort!, queryOptions.order!);

      const [tasks, total] = await Promise.all([
        Task.find(query)
          .sort(sort)
          .skip(skip)
          .limit(queryOptions.limit!)
          .populate('projectId', 'name')
          .populate('assigneeId', 'name email avatarUrl github githubLogin')
          .populate('dependencies', 'taskKey title status')
          .lean(),
        Task.countDocuments(query),
      ]);

      ResponseUtils.paginated(
        res,
        tasks,
        queryOptions.page!,
        queryOptions.limit!,
        total,
        'My tasks retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Get a single task by ID
  static async getTask(req: any, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const task = await Task.findById(id)
        .populate('projectId', 'name ownerId members github')
        .populate('assigneeId', 'name email avatarUrl github githubLogin')
        .populate('dependencies', 'taskKey title status')
        .populate('attachments.uploaderId', 'name');

      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }

      // Check if user has access to the project
      const project = task.projectId as any;
      const hasAccess =
        project.ownerId.toString() === userId.toString() ||
        project.members.some((member: any) => member.userId.toString() === userId.toString());

      if (!hasAccess) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }

      ResponseUtils.success(res, task, 'Task retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Create a new task
  static async createTask(req: any, res: Response): Promise<void> {
    try {
      const {
        projectId,
        title,
        description,
        assigneeId,
        dueDate,
        status,
        priority,
        tags,
        subtasks,
        requiresGitHubEvidence,
      } = req.body;
      const userId = req.user._id;

      // Check if user has access to the project
      const project = await Project.findOne({
        _id: projectId,
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        isActive: true,
      });

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or access denied');
        return;
      }

      // If assigneeId is provided, check if they are a member of the project
      if (assigneeId) {
        const isAssigneeMember =
          project.ownerId.toString() === assigneeId ||
          project.members.some((member: any) => member.userId.toString() === assigneeId);

        if (!isAssigneeMember) {
          ResponseUtils.error(res, 'Assignee is not a member of this project', 400);
          return;
        }
      }

      // Task keys must be unique per project: GitHub evidence is routed by key,
      // so a duplicate would attach a commit or pull request to the wrong task.
      // Projects created before task keys existed can hold tasks whose keys are
      // ahead of (or missing from) taskSequence, so advance the counter past the
      // highest key already in use before allocating the next one.
      const existingKeys = await Task.find({ projectId }).select('taskKey').lean();
      const highestExistingKey = existingKeys.reduce((highest: number, existing: any) => {
        const parsed = Number(String(existing.taskKey || '').replace('TASK-', ''));
        return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
      }, 0);
      const nextSequence = await Project.findOneAndUpdate(
        { _id: projectId },
        [
          {
            $set: { taskSequence: { $add: [{ $max: ['$taskSequence', highestExistingKey] }, 1] } },
          },
        ],
        { new: true }
      ).select('taskSequence');
      if (!nextSequence) {
        ResponseUtils.notFound(res, 'Project not found');
        return;
      }

      const taskData: any = {
        projectId,
        taskKey: `TASK-${nextSequence.taskSequence}`,
        title,
        description,
        requiresGitHubEvidence: Boolean(requiresGitHubEvidence),
        assigneeId: assigneeId || null,
        status: status || 'todo',
        priority: priority || 'medium',
        tags: tags || [],
        subtasks: subtasks || [],
      };

      if (dueDate) {
        taskData.dueDate = new Date(dueDate);
      }

      const task = new Task(taskData);
      await task.save();
      await TaskHistoryService.record({
        taskId: task.id,
        projectId,
        actorId: userId.toString(),
        type: 'TASK_CREATED',
        source: 'user',
        description: 'Task created',
        metadata: { taskKey: task.taskKey },
      });
      if (assigneeId) {
        await TaskHistoryService.record({
          taskId: task.id,
          projectId,
          actorId: userId.toString(),
          type: 'TASK_ASSIGNED',
          source: 'user',
          description: 'Task assigned',
          changes: { assigneeId: { before: null, after: assigneeId } },
        });
        if (assigneeId.toString() !== userId.toString()) {
          await NotificationService.create({
            userId: assigneeId,
            type: 'task_assigned',
            title: 'Task assigned to you',
            message: `${title} was assigned to you in ${project.name}`,
            payload: { projectId, taskId: task.id, taskKey: task.taskKey },
          });
        }
      }

      // Populate the created task
      const populatedTask = await Task.findById(task._id)
        .populate('assigneeId', 'name email avatarUrl github githubLogin')
        .populate('projectId', 'name');

      emitToProject(projectId, 'task:created', { projectId, task: populatedTask });

      ResponseUtils.created(res, populatedTask, 'Task created successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Update a task
  static async updateTask(req: any, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        assigneeId,
        dueDate,
        status,
        priority,
        tags,
        subtasks,
        requiresGitHubEvidence,
      } = req.body;
      const userId = req.user._id;

      const task = await Task.findById(id).populate('projectId', 'name ownerId members');

      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }

      // Check if user has access to the project
      const project = task.projectId as any;
      const previousAssigneeId = (task as any).assigneeId ? String((task as any).assigneeId) : null;
      const hasAccess =
        project.ownerId.toString() === userId.toString() ||
        project.members.some((member: any) => member.userId.toString() === userId.toString());

      if (!hasAccess) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }

      if (status === 'done') {
        ResponseUtils.forbidden(
          res,
          'Only an owner or manager can complete a task by approving submitted proof'
        );
        return;
      }
      if (status === 'ready_for_review' || status === 'changes_requested') {
        ResponseUtils.error(res, 'Use the proof review workflow to change this task status', 400);
        return;
      }
      if (status !== undefined && (task as any).status === 'ready_for_review') {
        ResponseUtils.error(
          res,
          'A task awaiting review can only be changed through the proof review workflow',
          400
        );
        return;
      }
      if (status !== undefined && (task as any).status === 'changes_requested') {
        if (status !== 'in_progress') {
          ResponseUtils.error(res, 'Resume work before changing a task after review feedback', 400);
          return;
        }
        if (String((task as any).assigneeId || '') !== userId.toString()) {
          ResponseUtils.forbidden(
            res,
            'Only the task assignee can resume work after changes are requested'
          );
          return;
        }
      }

      if (assigneeId !== undefined) {
        const assigneeIsMember =
          !assigneeId ||
          project.ownerId.toString() === assigneeId ||
          project.members.some((member: any) => member.userId.toString() === assigneeId);
        if (!assigneeIsMember) {
          ResponseUtils.error(res, 'Assignee is not a member of this project', 400);
          return;
        }
      }

      if (
        status === 'done' &&
        (task as any).status !== 'done' &&
        (await TaskController.hasIncompleteDependencies(task))
      ) {
        ResponseUtils.error(
          res,
          'Cannot complete a task while its dependencies are incomplete',
          400
        );
        return;
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (requiresGitHubEvidence !== undefined)
        updateData.requiresGitHubEvidence = Boolean(requiresGitHubEvidence);
      if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
      if (dueDate !== undefined) {
        updateData.dueDate = dueDate ? new Date(dueDate) : null;
        // A rescheduled task should remind against its new date, so drop the
        // stamps that suppress repeat reminders.
        updateData.$unset = {
          ...(updateData.$unset || {}),
          dueReminderSentAt: 1,
          overdueReminderSentAt: 1,
        };
      }
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (tags !== undefined) updateData.tags = tags;
      if (subtasks !== undefined) updateData.subtasks = subtasks;

      const changes: Record<string, { before?: unknown; after?: unknown }> = {};
      for (const field of [
        'title',
        'description',
        'requiresGitHubEvidence',
        'assigneeId',
        'dueDate',
        'status',
        'priority',
        'tags',
        'subtasks',
      ]) {
        if (
          updateData[field] !== undefined &&
          String((task as any)[field] ?? '') !== String(updateData[field] ?? '')
        ) {
          changes[field] = { before: (task as any)[field], after: updateData[field] };
        }
      }

      const updatedTask = await Task.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
        .populate('assigneeId', 'name email avatarUrl github githubLogin')
        .populate('projectId', 'name');

      if (Object.keys(changes).length > 0) {
        const historyTypes: Record<
          string,
          | 'STATUS_CHANGED'
          | 'TASK_ASSIGNED'
          | 'PRIORITY_CHANGED'
          | 'DEADLINE_CHANGED'
          | 'TASK_UPDATED'
        > = {
          status: 'STATUS_CHANGED',
          assigneeId: 'TASK_ASSIGNED',
          priority: 'PRIORITY_CHANGED',
          dueDate: 'DEADLINE_CHANGED',
        };
        for (const [field, fieldChanges] of Object.entries(changes)) {
          const type = historyTypes[field] || 'TASK_UPDATED';
          await TaskHistoryService.record({
            taskId: id,
            projectId: project._id.toString(),
            actorId: userId.toString(),
            type,
            source: 'user',
            description: `${type.replace(/_/g, ' ').toLowerCase()}`,
            changes: { [field]: fieldChanges },
          });
        }
      }

      if (changes.status && changes.status.after === 'done' && changes.status.before !== 'done') {
        await TaskHistoryService.record({
          taskId: id,
          projectId: project._id.toString(),
          actorId: userId.toString(),
          type: 'TASK_COMPLETED',
          source: 'user',
          description: 'Task completed',
        });
      }

      const projectId = project._id.toString();
      emitToProject(projectId, 'task:updated', { projectId, task: updatedTask, changes });
      const taskTitle = updatedTask?.title || (task as any).title || 'A task';
      if (
        assigneeId !== undefined &&
        String(assigneeId || '') !== String(previousAssigneeId || '')
      ) {
        const nextAssigneeId = assigneeId ? String(assigneeId) : null;
        const assignmentNotifications: any[] = [];
        if (nextAssigneeId && nextAssigneeId !== userId.toString()) {
          assignmentNotifications.push({
            userId: nextAssigneeId,
            type: previousAssigneeId ? 'task_reassigned' : 'task_assigned',
            title: previousAssigneeId ? 'Task reassigned to you' : 'Task assigned to you',
            message: `${taskTitle} was ${previousAssigneeId ? 'reassigned to you' : 'assigned to you'} in ${project.name}`,
            payload: { projectId, taskId: id, taskKey: (task as any).taskKey },
          });
        }
        if (previousAssigneeId && previousAssigneeId !== userId.toString()) {
          assignmentNotifications.push({
            userId: previousAssigneeId,
            type: nextAssigneeId ? 'task_reassigned' : 'task_unassigned',
            title: nextAssigneeId ? 'Task reassigned' : 'Task unassigned',
            message: nextAssigneeId
              ? `${taskTitle} was reassigned to another project member`
              : `${taskTitle} is no longer assigned to you`,
            payload: { projectId, taskId: id, taskKey: (task as any).taskKey },
          });
        }
        await NotificationService.createMany(assignmentNotifications);
      }

      if (changes.status) {
        const statusRecipientId =
          assigneeId !== undefined ? (assigneeId ? String(assigneeId) : null) : previousAssigneeId;
        if (statusRecipientId && statusRecipientId !== userId.toString()) {
          const completed = changes.status.after === 'done';
          await NotificationService.create({
            userId: statusRecipientId,
            type: completed
              ? 'task_completed'
              : changes.status.after === 'blocked'
                ? 'task_blocked'
                : 'task_status_changed',
            title: completed
              ? 'Task completed'
              : changes.status.after === 'blocked'
                ? 'Task blocked'
                : 'Task status changed',
            message: completed
              ? `${taskTitle} was completed`
              : changes.status.after === 'blocked'
                ? `${taskTitle} is blocked`
                : `${taskTitle} is now ${String(changes.status.after).replace('_', ' ')}`,
            payload: {
              projectId,
              taskId: id,
              taskKey: (task as any).taskKey,
              status: changes.status.after,
            },
          });
        }
      }

      const currentAssigneeId =
        assigneeId !== undefined ? (assigneeId ? String(assigneeId) : null) : previousAssigneeId;
      if (
        changes.dueDate &&
        dueDate &&
        currentAssigneeId &&
        currentAssigneeId !== userId.toString()
      ) {
        await NotificationService.create({
          userId: currentAssigneeId,
          type: 'task_due',
          title: 'Task due date updated',
          message: `${taskTitle} is due on ${new Date(dueDate).toLocaleDateString()}`,
          payload: { projectId, taskId: id, taskKey: (task as any).taskKey, dueDate },
        });
      }

      ResponseUtils.success(res, updatedTask, 'Task updated successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Delete a task
  static async deleteTask(req: any, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const task = await Task.findById(id).populate('projectId', 'ownerId members');

      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }

      // Check if user has access to the project
      const project = task.projectId as any;
      const hasAccess =
        project.ownerId.toString() === userId.toString() ||
        project.members.some((member: any) => member.userId.toString() === userId.toString());

      if (!hasAccess) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }

      await Task.findByIdAndDelete(id);
      await TaskHistoryService.record({
        taskId: id,
        projectId: project._id.toString(),
        actorId: userId.toString(),
        type: 'TASK_DELETED',
        source: 'user',
        description: 'Task deleted',
      });
      emitToProject(project._id.toString(), 'task:deleted', {
        projectId: project._id.toString(),
        taskId: id,
      });

      ResponseUtils.success(res, null, 'Task deleted successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Update task status
  static async updateTaskStatus(req: any, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user._id;

      if (
        ![
          'todo',
          'in_progress',
          'blocked',
          'ready_for_review',
          'changes_requested',
          'done',
        ].includes(status)
      ) {
        ResponseUtils.error(res, 'Invalid status', 400);
        return;
      }
      if (status === 'done') {
        ResponseUtils.forbidden(
          res,
          'Only an owner or manager can complete a task by approving submitted proof'
        );
        return;
      }
      if (status === 'ready_for_review' || status === 'changes_requested') {
        ResponseUtils.error(res, 'Use the proof review workflow to change this task status', 400);
        return;
      }

      const task = await Task.findById(id).populate('projectId', 'name ownerId members');

      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }

      // Check if user has access to the project
      const project = task.projectId as any;
      const hasAccess =
        project.ownerId.toString() === userId.toString() ||
        project.members.some((member: any) => member.userId.toString() === userId.toString());

      if (!hasAccess) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }

      if (task.status === 'ready_for_review' && status !== task.status) {
        ResponseUtils.error(
          res,
          'A task awaiting review can only be changed through the proof review workflow',
          400
        );
        return;
      }
      if (task.status === 'changes_requested' && status !== task.status) {
        if (status !== 'in_progress') {
          ResponseUtils.error(res, 'Resume work before changing a task after review feedback', 400);
          return;
        }
        if (String((task as any).assigneeId || '') !== userId.toString()) {
          ResponseUtils.forbidden(
            res,
            'Only the task assignee can resume work after changes are requested'
          );
          return;
        }
      }

      const previousStatus = task.status;
      if (
        status === 'done' &&
        previousStatus !== 'done' &&
        (await TaskController.hasIncompleteDependencies(task))
      ) {
        ResponseUtils.error(
          res,
          'Cannot complete a task while its dependencies are incomplete',
          400
        );
        return;
      }
      task.status = status as TaskStatus;
      await task.save();
      if (previousStatus !== status) {
        await TaskHistoryService.record({
          taskId: id,
          projectId: project._id.toString(),
          actorId: userId.toString(),
          type: 'STATUS_CHANGED',
          source: 'user',
          description: `Status changed from ${previousStatus} to ${status}`,
          changes: { status: { before: previousStatus, after: status } },
        });
        if (status === 'done' && previousStatus !== 'done') {
          await TaskHistoryService.record({
            taskId: id,
            projectId: project._id.toString(),
            actorId: userId.toString(),
            type: 'TASK_COMPLETED',
            source: 'user',
            description: 'Task completed',
          });
        }
      }

      const updatedTask = await Task.findById(id)
        .populate('assigneeId', 'name email avatarUrl github githubLogin')
        .populate('projectId', 'name');

      emitToProject(project._id.toString(), 'task:status-changed', {
        projectId: project._id.toString(),
        task: updatedTask,
      });
      const assigneeId = (task as any).assigneeId?.toString();
      if (previousStatus !== status && assigneeId && assigneeId !== userId.toString()) {
        await NotificationService.create({
          userId: assigneeId,
          type:
            status === 'done'
              ? 'task_completed'
              : status === 'blocked'
                ? 'task_blocked'
                : 'task_status_changed',
          title:
            status === 'done'
              ? 'Task completed'
              : status === 'blocked'
                ? 'Task blocked'
                : 'Task status changed',
          message:
            status === 'done'
              ? `${updatedTask?.title || 'A task'} was completed`
              : status === 'blocked'
                ? `${updatedTask?.title || 'A task'} is blocked`
                : `${updatedTask?.title || 'A task'} is now ${String(status).replace('_', ' ')}`,
          payload: {
            projectId: project._id.toString(),
            taskId: id,
            taskKey: (task as any).taskKey,
            status,
          },
        });
      }

      if (status === 'done' && previousStatus !== 'done') {
        const dependentTasks = await Task.find({
          dependencies: id,
          status: { $ne: 'done' },
          assigneeId: { $ne: null },
        })
          .select('projectId taskKey title assigneeId')
          .lean();
        await NotificationService.createMany(
          dependentTasks
            .filter(dependentTask => String(dependentTask.assigneeId) !== userId.toString())
            .map(dependentTask => ({
              userId: String(dependentTask.assigneeId),
              type: 'task_dependency_changed' as const,
              title: 'Task dependency completed',
              message: `${updatedTask?.title || (task as any).title} was completed; ${dependentTask.title} can now progress`,
              payload: {
                projectId: String(dependentTask.projectId),
                taskId: String(dependentTask._id),
                taskKey: dependentTask.taskKey,
                dependencyTaskId: id,
              },
            }))
        );
      }

      ResponseUtils.success(res, updatedTask, 'Task status updated successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async addDependency(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { dependencyTaskId } = req.body;
      const task = await Task.findById(id);
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }

      const project = await Project.findOne({
        _id: task.projectId,
        isActive: true,
        $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
      });
      if (!project) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }
      if (String(task._id) === String(dependencyTaskId)) {
        ResponseUtils.error(res, 'A task cannot depend on itself', 400);
        return;
      }

      const dependency = await Task.findOne({ _id: dependencyTaskId, projectId: task.projectId });
      if (!dependency) {
        ResponseUtils.error(res, 'Dependency must be another task in the same project', 400);
        return;
      }
      if ((task.dependencies || []).some((item: any) => String(item) === String(dependency._id))) {
        ResponseUtils.error(res, 'This dependency already exists', 409);
        return;
      }
      if (
        await TaskController.createsDependencyCycle(
          task.projectId,
          String(task._id),
          String(dependency._id)
        )
      ) {
        ResponseUtils.error(res, 'This dependency would create a circular dependency', 400);
        return;
      }

      task.dependencies = [...(task.dependencies || []), dependency._id] as any;
      await task.save();
      await TaskHistoryService.record({
        taskId: String(task._id),
        projectId: String(task.projectId),
        actorId: String(req.user._id),
        type: 'DEPENDENCY_ADDED',
        source: 'user',
        description: `Dependency added: ${dependency.taskKey || dependency.title}`,
        metadata: { dependencyTaskId: String(dependency._id) },
      });
      const dependencyRecipients = new Set<string>();
      if ((task as any).assigneeId) dependencyRecipients.add(String((task as any).assigneeId));
      dependencyRecipients.add(String(project.ownerId));
      dependencyRecipients.delete(String(req.user._id));
      await NotificationService.createMany(
        [...dependencyRecipients].map(userId => ({
          userId,
          type: 'task_dependency_changed' as const,
          title: 'Task dependency added',
          message: `${dependency.title} is now required before ${(task as any).title} can be completed`,
          payload: {
            projectId: String(task.projectId),
            taskId: String(task._id),
            taskKey: (task as any).taskKey,
            dependencyTaskId: String(dependency._id),
          },
        }))
      );

      const updatedTask = await Task.findById(task._id).populate(
        'dependencies',
        'taskKey title status'
      );
      ResponseUtils.success(res, updatedTask, 'Task dependency added successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async removeDependency(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id, dependencyId } = req.params;
      const task = await Task.findById(id);
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }
      const project = await Project.findOne({
        _id: task.projectId,
        isActive: true,
        $or: [{ ownerId: req.user._id }, { 'members.userId': req.user._id }],
      });
      if (!project) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }
      if (!(task.dependencies || []).some((item: any) => String(item) === String(dependencyId))) {
        ResponseUtils.notFound(res, 'Task dependency not found');
        return;
      }

      task.dependencies = (task.dependencies || []).filter(
        (item: any) => String(item) !== String(dependencyId)
      ) as any;
      await task.save();
      await TaskHistoryService.record({
        taskId: String(task._id),
        projectId: String(task.projectId),
        actorId: String(req.user._id),
        type: 'DEPENDENCY_REMOVED',
        source: 'user',
        description: 'Task dependency removed',
        metadata: { dependencyTaskId: dependencyId },
      });
      const dependencyRecipients = new Set<string>();
      if ((task as any).assigneeId) dependencyRecipients.add(String((task as any).assigneeId));
      dependencyRecipients.add(String(project.ownerId));
      dependencyRecipients.delete(String(req.user._id));
      await NotificationService.createMany(
        [...dependencyRecipients].map(userId => ({
          userId,
          type: 'task_dependency_changed' as const,
          title: 'Task dependency removed',
          message: `A required dependency was removed from ${(task as any).title}`,
          payload: {
            projectId: String(task.projectId),
            taskId: String(task._id),
            taskKey: (task as any).taskKey,
            dependencyTaskId: dependencyId,
          },
        }))
      );

      const updatedTask = await Task.findById(task._id).populate(
        'dependencies',
        'taskKey title status'
      );
      ResponseUtils.success(res, updatedTask, 'Task dependency removed successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async getTaskHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await Task.findById(req.params.id).populate('projectId', 'ownerId members');
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found');
        return;
      }
      const project = task.projectId as any;
      const userId = req.user._id.toString();
      const hasAccess =
        project.ownerId.toString() === userId ||
        project.members.some((member: any) => member.userId.toString() === userId);
      if (!hasAccess) {
        ResponseUtils.forbidden(res, 'Access denied');
        return;
      }
      const history = await TaskHistoryService.listForTask(req.params.id);
      ResponseUtils.success(res, history, 'Task history retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
