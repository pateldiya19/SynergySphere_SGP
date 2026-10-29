import { Router } from 'express';
import { ProjectController } from '@/controllers/ProjectController';
import { ProjectInvitationController } from '@/controllers/ProjectInvitationController';
import { ProjectAnalyticsController } from '@/controllers/ProjectAnalyticsController';
import { ProjectHealthController } from '@/controllers/ProjectHealthController';
import { authenticate, validate } from '@/middleware';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Project routes
router.get('/', ProjectController.getProjects);
router.post('/', validate(ProjectController.createValidation), ProjectController.createProject);

router.get('/:id', validate(ProjectController.getProjectValidation), ProjectController.getProject);
router.get(
  '/:id/health',
  validate(ProjectHealthController.validation),
  ProjectHealthController.get
);
router.get(
  '/:id/analytics',
  validate(ProjectAnalyticsController.validation),
  ProjectAnalyticsController.get
);
router.put('/:id', validate(ProjectController.updateValidation), ProjectController.updateProject);
router.delete(
  '/:id',
  validate(ProjectController.getProjectValidation),
  ProjectController.deleteProject
);

// Member management
router.post(
  '/:id/members',
  validate(ProjectController.addMemberValidation),
  ProjectController.addMember
);
router.delete(
  '/:id/members/:userId',
  validate(ProjectController.removeMemberValidation),
  ProjectController.removeMember
);
router.patch(
  '/:id/members/:userId',
  validate(ProjectController.updateMemberRoleValidation),
  ProjectController.updateMemberRole
);
router.post(
  '/:id/invitations',
  validate(ProjectInvitationController.createValidation),
  ProjectInvitationController.create
);
router.get('/:id/invitations', ProjectInvitationController.listProject);
router.delete(
  '/:id/invitations/:invitationId',
  validate(ProjectInvitationController.cancelValidation),
  ProjectInvitationController.cancel
);

export default router;
