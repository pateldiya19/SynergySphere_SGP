import { Router } from 'express';
import { ProjectInvitationController } from '@/controllers/ProjectInvitationController';
import { authenticate, validate } from '@/middleware';

const router = Router();

router.use(authenticate);
router.get(
  '/',
  validate(ProjectInvitationController.listValidation),
  ProjectInvitationController.listIncoming
);
router.patch(
  '/:id/accept',
  validate(ProjectInvitationController.invitationValidation),
  ProjectInvitationController.respond
);
router.patch(
  '/:id/decline',
  validate(ProjectInvitationController.invitationValidation),
  ProjectInvitationController.respond
);

export default router;
