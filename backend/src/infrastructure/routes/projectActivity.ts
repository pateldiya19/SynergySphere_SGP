import { Router } from 'express';
import { ProjectActivityController } from '@/controllers/ProjectActivityController';
import { authenticate, validate } from '@/middleware';

const router = Router();

router.use(authenticate);
router.get(
  '/:id/activity',
  validate(ProjectActivityController.validation),
  ProjectActivityController.list
);

export default router;
