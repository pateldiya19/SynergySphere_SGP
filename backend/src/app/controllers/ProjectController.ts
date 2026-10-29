import { Response } from 'express';
import { body, param } from 'express-validator';
import { Project, User } from '@/models';
import { parseRepositoryInput, QueryUtils, ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';
import { emitToProject } from '@/infrastructure/socket';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { NotificationService } from '@/services/NotificationService';

export class ProjectController {
  // Validation rules
  static createValidation = [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Project name is required and cannot exceed 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('deadline').optional().isISO8601().withMessage('Deadline must be a valid date'),
    body('github').optional().isObject().withMessage('GitHub repository must be an object'),
    body('github.owner').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
    body('github.name').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  ];

  static updateValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Project name cannot exceed 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('deadline').optional().isISO8601().withMessage('Deadline must be a valid date'),
    body('github')
      .optional({ nullable: true })
      .isObject()
      .withMessage('GitHub repository must be an object'),
    body('github.owner').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
    body('github.name').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  ];

  static getProjectValidation = [param('id').isMongoId().withMessage('Invalid project ID')];

  static addMemberValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    body('userId').isMongoId().withMessage('Invalid user ID'),
    body('role').optional().isIn(['member']).withMessage('Only member roles can be added'),
  ];

  static removeMemberValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    param('userId').isMongoId().withMessage('Invalid user ID'),
  ];

  static updateMemberRoleValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    param('userId').isMongoId().withMessage('Invalid user ID'),
    body('role').isIn(['manager', 'member']).withMessage('Role must be manager or member'),
  ];

  private static canManageMembers(project: any, userId: string): boolean {
    if (project.ownerId.toString() === userId) return true;
    return project.members.some(
      (member: any) => member.userId.toString() === userId && member.role === 'manager'
    );
  }

  // Get all projects for the authenticated user
  static async getProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const queryOptions = QueryUtils.parseQueryOptions(req.query);
      const userId = req.user._id;

      const query: any = {
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        isActive: true,
      };

      // Add search functionality
      if (queryOptions.search) {
        const searchQuery = QueryUtils.buildSearchQuery(queryOptions.search, [
          'name',
          'description',
        ]);
        query.$and = [query, searchQuery];
      }

      const skip = QueryUtils.calculateSkip(queryOptions.page!, queryOptions.limit!);
      const sort = QueryUtils.buildSortObject(queryOptions.sort!, queryOptions.order!);

      const [projects, total] = await Promise.all([
        Project.find(query)
          .sort(sort)
          .skip(skip)
          .limit(queryOptions.limit!)
          .populate('ownerId', 'name email avatarUrl')
          .populate('members.userId', 'name email avatarUrl')
          .lean(),
        Project.countDocuments(query),
      ]);

      ResponseUtils.paginated(
        res,
        projects,
        queryOptions.page!,
        queryOptions.limit!,
        total,
        'Projects retrieved successfully'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Get a single project by ID
  static async getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const project = await Project.findOne({
        _id: id,
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        isActive: true,
      })
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl');

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found');
        return;
      }

      ResponseUtils.success(res, project, 'Project retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Create a new project
  static async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, description, tags, deadline, github } = req.body;
      const userId = req.user._id;

      const projectData: any = {
        name,
        description,
        ownerId: userId,
        tags: tags || [],
      };

      if (deadline) {
        projectData.deadline = new Date(deadline);
      }

      if (github) {
        const parsed = parseRepositoryInput(github.owner, github.name);
        if (!parsed) {
          ResponseUtils.error(
            res,
            'Enter the repository as owner and name, or paste its GitHub URL',
            400
          );
          return;
        }
        const { owner, name: repositoryName } = parsed;

        // See the update path: one repository, one project, so webhook
        // deliveries always have exactly one place to land.
        const alreadyBound = await Project.findOne({
          isActive: true,
          'github.owner': owner,
          'github.name': repositoryName,
        })
          .select('name')
          .lean<{ name: string } | null>();

        if (alreadyBound) {
          ResponseUtils.error(
            res,
            `${owner}/${repositoryName} is already connected to the project "${alreadyBound.name}". ` +
              'Disconnect it there first, or connect a different repository.',
            409
          );
          return;
        }

        projectData.github = {
          owner,
          name: repositoryName,
          url: `https://github.com/${owner}/${repositoryName}`,
          ...(typeof github.repositoryId === 'number' ? { repositoryId: github.repositoryId } : {}),
        };
      }

      const project = new Project(projectData);
      await project.save();

      // Populate the created project
      const populatedProject = await Project.findById(project._id)
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl');

      emitToProject(project.id, 'project:created', {
        projectId: project.id,
        project: populatedProject,
      });

      ResponseUtils.created(res, populatedProject, 'Project created successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Update a project
  static async updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, tags, deadline, github } = req.body;
      const userId = req.user._id;

      // Check if user is the owner
      const project = await Project.findOne({
        _id: id,
        ownerId: userId,
        isActive: true,
      });

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized to update it');
        return;
      }

      const updateData: any = {};
      const updateOperators: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (tags !== undefined) updateData.tags = tags;
      if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
      if (github !== undefined) {
        if (github === null) {
          updateOperators.$unset = { github: 1 };
        } else {
          const parsed = parseRepositoryInput(github.owner, github.name);
          if (!parsed) {
            ResponseUtils.error(
              res,
              'Enter the repository as owner and name, or paste its GitHub URL',
              400
            );
            return;
          }
          const { owner, name: repositoryName } = parsed;

          // The webhook finds its project by repository, so binding the same
          // repository to two projects makes the destination of an incoming
          // commit arbitrary -- evidence silently lands on the wrong board.
          const alreadyBound = await Project.findOne({
            _id: { $ne: id },
            isActive: true,
            'github.owner': owner,
            'github.name': repositoryName,
          })
            .select('name')
            .lean<{ name: string } | null>();

          if (alreadyBound) {
            ResponseUtils.error(
              res,
              `${owner}/${repositoryName} is already connected to the project "${alreadyBound.name}". ` +
                'Disconnect it there first, or connect a different repository.',
              409
            );
            return;
          }

          updateData.github = {
            owner,
            name: repositoryName,
            url: `https://github.com/${owner}/${repositoryName}`,
            ...(typeof github.repositoryId === 'number'
              ? { repositoryId: github.repositoryId }
              : {}),
          };
        }
      }

      const updatedProject = await Project.findByIdAndUpdate(
        id,
        { ...updateData, ...updateOperators },
        { new: true, runValidators: true }
      )
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl');

      emitToProject(id, 'project:updated', { projectId: id, project: updatedProject });

      ResponseUtils.success(res, updatedProject, 'Project updated successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Delete a project (soft delete)
  static async deleteProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const project = await Project.findOne({
        _id: id,
        ownerId: userId,
        isActive: true,
      });

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized to delete it');
        return;
      }

      project.isActive = false;
      await project.save();
      emitToProject(id, 'project:deleted', { projectId: id });

      ResponseUtils.success(res, null, 'Project deleted successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Add a member to the project
  static async addMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId: memberUserId } = req.body;
      const currentUserId = req.user._id;

      const project = await Project.findOne({ _id: id, isActive: true });

      if (!project || !ProjectController.canManageMembers(project, currentUserId.toString())) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized');
        return;
      }

      // Check if user exists
      const memberUser = await User.findById(memberUserId);
      if (!memberUser || !memberUser.isActive) {
        ResponseUtils.notFound(res, 'User not found or inactive');
        return;
      }

      // Check if user is already a member
      const existingMember = project.members.find(
        member => member.userId.toString() === memberUserId
      );

      if (existingMember) {
        ResponseUtils.error(res, 'User is already a member of this project', 409);
        return;
      }

      // Add member
      project.members.push({
        userId: memberUserId,
        role: 'member',
        joinedAt: new Date(),
      });

      await project.save();

      await TaskHistoryService.record({
        projectId: id,
        actorId: currentUserId.toString(),
        type: 'MEMBER_ADDED',
        source: 'user',
        description: 'Member added to project',
        metadata: { memberId: memberUserId },
      });
      await NotificationService.create({
        userId: memberUserId,
        type: 'project_member_added',
        title: 'Added to a project',
        message: `You were added to ${project.name}`,
        payload: { projectId: id },
      });

      const updatedProject = await Project.findById(id)
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl');

      ResponseUtils.success(res, updatedProject, 'Member added successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Remove a member from the project
  static async removeMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id, userId: memberUserId } = req.params;
      const currentUserId = req.user._id;

      const project = await Project.findOne({ _id: id, isActive: true });

      if (!project || !ProjectController.canManageMembers(project, currentUserId.toString())) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized');
        return;
      }

      // Cannot remove the owner
      if (memberUserId === project.ownerId.toString()) {
        ResponseUtils.error(res, 'Cannot remove the project owner', 400);
        return;
      }

      const targetMember = project.members.find(
        member => member.userId.toString() === memberUserId
      );
      if (!targetMember) {
        ResponseUtils.notFound(res, 'Project member not found');
        return;
      }
      if (
        currentUserId.toString() !== project.ownerId.toString() &&
        targetMember.role !== 'member'
      ) {
        ResponseUtils.forbidden(res, 'Managers can only remove regular members');
        return;
      }

      // Remove member
      project.members = project.members.filter(member => member.userId.toString() !== memberUserId);

      await project.save();

      await TaskHistoryService.record({
        projectId: id,
        actorId: currentUserId.toString(),
        type: 'MEMBER_REMOVED',
        source: 'user',
        description: 'Member removed from project',
        metadata: { memberId: memberUserId },
      });
      await NotificationService.create({
        userId: memberUserId,
        type: 'project_member_removed',
        title: 'Removed from a project',
        message: `You were removed from ${project.name}`,
        payload: { projectId: id },
      });

      const updatedProject = await Project.findById(id)
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl');

      ResponseUtils.success(res, updatedProject, 'Member removed successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  // Update a member role. Only the project owner can change roles.
  static async updateMemberRole(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id, userId: memberUserId } = req.params;
      const { role } = req.body;
      const project = await Project.findOne({ _id: id, ownerId: req.user._id, isActive: true });

      if (!project) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized');
        return;
      }
      if (memberUserId === project.ownerId.toString()) {
        ResponseUtils.error(res, 'Cannot change the project owner role', 400);
        return;
      }

      const member = project.members.find(item => item.userId.toString() === memberUserId);
      if (!member) {
        ResponseUtils.notFound(res, 'Project member not found');
        return;
      }

      member.role = role;
      await project.save();
      const updatedProject = await Project.findById(id)
        .populate('ownerId', 'name email avatarUrl')
        .populate('members.userId', 'name email avatarUrl');
      ResponseUtils.success(res, updatedProject, 'Member role updated successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
