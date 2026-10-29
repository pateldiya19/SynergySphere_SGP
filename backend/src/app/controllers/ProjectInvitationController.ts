import { Response } from 'express';
import { body, param, query } from 'express-validator';
import { Notification, Project, ProjectInvitation, User } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { NotificationService } from '@/services/NotificationService';
import { EmailService } from '@/services/EmailService';
import { ResponseUtils } from '@/utils';
import { emitToProject } from '@/infrastructure/socket';
import { TaskHistoryService } from '@/services/TaskHistoryService';

export class ProjectInvitationController {
  static createValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    body('userId').isMongoId().withMessage('Invalid user ID'),
  ];

  static idValidation = [param('id').isMongoId().withMessage('Invalid project ID')];
  static invitationValidation = [param('id').isMongoId().withMessage('Invalid invitation ID')];
  static cancelValidation = [
    param('id').isMongoId().withMessage('Invalid project ID'),
    param('invitationId').isMongoId().withMessage('Invalid invitation ID'),
  ];
  static listValidation = [
    query('projectId').optional().isMongoId().withMessage('Invalid project ID'),
  ];

  static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const project = await Project.findOne({ _id: req.params.id, isActive: true });
      const canInvite =
        project &&
        (String(project.ownerId) === String(req.user._id) ||
          project.members.some(
            member => String(member.userId) === String(req.user._id) && member.role === 'manager'
          ));
      if (!project || !canInvite) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized');
        return;
      }

      const invitee = await User.findOne({ _id: req.body.userId, isActive: true }).select(
        'name email avatarUrl'
      );
      if (!invitee) {
        ResponseUtils.notFound(res, 'User not found or inactive');
        return;
      }
      if (
        String(project.ownerId) === String(invitee._id) ||
        project.members.some(member => String(member.userId) === String(invitee._id))
      ) {
        ResponseUtils.error(res, 'User is already a member of this project', 409);
        return;
      }

      const existing = await ProjectInvitation.findOne({
        projectId: project._id,
        inviteeId: invitee._id,
        status: 'pending',
      });
      if (existing) {
        ResponseUtils.error(res, 'A pending invitation already exists for this user', 409);
        return;
      }

      const invitation = await ProjectInvitation.create({
        projectId: project._id,
        inviterId: req.user._id,
        inviteeId: invitee._id,
      });
      await NotificationService.create({
        userId: String(invitee._id),
        type: 'project_invite',
        title: 'Project invitation',
        message: `You were invited to join ${project.name}`,
        payload: { projectId: String(project._id), invitationId: String(invitation._id) },
      });

      // Email is a bonus on top of the in-app notification above, so it is not
      // awaited into the response path and a failure is already swallowed and
      // logged inside EmailService.
      void EmailService.sendProjectInvitation({
        to: invitee.email,
        inviterName: req.user.name,
        projectName: project.name,
      });

      const result = await ProjectInvitation.findById(invitation._id)
        .populate('projectId', 'name')
        .populate('inviterId', 'name email avatarUrl')
        .populate('inviteeId', 'name email avatarUrl');
      ResponseUtils.created(res, result, 'Project invitation sent');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async listIncoming(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const invitations = await ProjectInvitation.find({
        inviteeId: req.user._id,
        status: 'pending',
      })
        .sort({ createdAt: -1 })
        .populate('projectId', 'name description')
        .populate('inviterId', 'name email avatarUrl')
        .lean();
      ResponseUtils.success(res, invitations, 'Project invitations retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async listProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const project = await Project.findOne({ _id: req.params.id, isActive: true }).select(
        'ownerId members'
      );
      const canView =
        project &&
        (String(project.ownerId) === String(req.user._id) ||
          project.members.some(
            member =>
              String(member.userId) === String(req.user._id) &&
              ['manager', 'member'].includes(member.role)
          ));
      if (!project || !canView) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized');
        return;
      }
      const invitations = await ProjectInvitation.find({
        projectId: project._id,
        status: 'pending',
      })
        .sort({ createdAt: -1 })
        .populate('inviteeId', 'name email avatarUrl')
        .lean();
      ResponseUtils.success(res, invitations, 'Project invitations retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async cancel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const project = await Project.findOne({ _id: req.params.id, isActive: true });
      const canCancel =
        project &&
        (String(project.ownerId) === String(req.user._id) ||
          project.members.some(
            member => String(member.userId) === String(req.user._id) && member.role === 'manager'
          ));
      if (!project || !canCancel) {
        ResponseUtils.notFound(res, 'Project not found or you are not authorized');
        return;
      }

      const invitation = await ProjectInvitation.findOneAndUpdate(
        { _id: req.params.invitationId, projectId: project._id, status: 'pending' },
        { status: 'cancelled' },
        { new: true, runValidators: true }
      ).populate('inviteeId', 'name email avatarUrl');
      if (!invitation) {
        ResponseUtils.notFound(res, 'Pending invitation not found');
        return;
      }

      const inviteeId = String((invitation.inviteeId as any)?._id || invitation.inviteeId);
      await Notification.deleteMany({
        userId: invitation.inviteeId,
        'payload.invitationId': String(invitation._id),
      });
      await NotificationService.create({
        userId: inviteeId,
        type: 'project_invite_cancelled',
        title: 'Project invitation cancelled',
        message: `The invitation to join ${project.name} was cancelled`,
        payload: {
          projectId: String(project._id),
          invitationId: String(invitation._id),
          status: 'cancelled',
        },
      });
      ResponseUtils.success(res, invitation, 'Project invitation cancelled');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async respond(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const status = req.path.endsWith('/accept') ? 'accepted' : 'declined';
      const invitation = await ProjectInvitation.findOne({
        _id: req.params.id,
        inviteeId: req.user._id,
        status: 'pending',
      });
      if (!invitation) {
        ResponseUtils.notFound(res, 'Pending invitation not found');
        return;
      }

      if (status === 'accepted') {
        const project = await Project.findOne({ _id: invitation.projectId, isActive: true });
        if (!project) {
          ResponseUtils.notFound(res, 'Project is no longer available');
          return;
        }
        if (!project.members.some(member => String(member.userId) === String(req.user._id))) {
          project.members.push({ userId: req.user._id, role: 'member', joinedAt: new Date() });
          await project.save();
          await TaskHistoryService.record({
            projectId: String(project._id),
            actorId: String(req.user._id),
            type: 'MEMBER_ADDED',
            source: 'user',
            description: 'Member joined project',
            metadata: { memberId: String(req.user._id), invitationId: String(invitation._id) },
          });
        }
        emitToProject(String(project._id), 'project:member-added', {
          projectId: String(project._id),
          userId: String(req.user._id),
        });
      }

      invitation.status = status;
      await invitation.save();
      await Notification.updateOne(
        { userId: req.user._id, 'payload.invitationId': String(invitation._id) },
        { $set: { read: true } }
      );
      await NotificationService.create({
        userId: String(invitation.inviterId),
        type: status === 'accepted' ? 'project_invite_accepted' : 'project_invite_declined',
        title:
          status === 'accepted' ? 'Project invitation accepted' : 'Project invitation declined',
        message: `${req.user.name} ${status === 'accepted' ? 'joined' : 'declined'} the project invitation`,
        payload: {
          projectId: String(invitation.projectId),
          invitationId: String(invitation._id),
          status,
        },
      });

      const result = await ProjectInvitation.findById(invitation._id).populate(
        'projectId',
        'name description'
      );
      ResponseUtils.success(res, result, `Project invitation ${status}`);
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
