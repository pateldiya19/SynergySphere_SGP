import { Router } from 'express';
import { NotificationController } from '@/controllers/NotificationController';
import { authenticate, validate } from '@/middleware';

const router = Router();

router.use(authenticate);
router.get('/', validate(NotificationController.listValidation), NotificationController.list);
router.patch('/read-all', NotificationController.markAllRead);
router.patch(
  '/:id/read',
  validate(NotificationController.idValidation),
  NotificationController.markRead
);

export default router;
