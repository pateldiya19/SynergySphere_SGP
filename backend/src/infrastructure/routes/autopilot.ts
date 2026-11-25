import { Router } from 'express';
import { AutopilotController } from '@/controllers/AutopilotController';
import { authenticate, validate } from '@/middleware';

const router = Router();
router.use(authenticate);
router.get('/:id', validate(AutopilotController.projectValidation), AutopilotController.get);
router.post(
  '/:id/assistant',
  validate(AutopilotController.questionValidation),
  AutopilotController.ask
);
router.post(
  '/:id/assistant/stream',
  validate(AutopilotController.questionValidation),
  AutopilotController.stream
);
router.post(
  '/actions/:actionId/approve',
  validate(AutopilotController.actionValidation),
  AutopilotController.approve
);
router.post(
  '/actions/:actionId/reject',
  validate(AutopilotController.actionValidation),
  AutopilotController.reject
);

export default router;
