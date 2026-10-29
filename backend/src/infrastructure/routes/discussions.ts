import { Router } from 'express';
import { DiscussionController } from '@/controllers/DiscussionController';
import { authenticate, validate } from '@/middleware';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Discussion threads for a project
router.get(
  '/project/:projectId',
  validate(DiscussionController.projectParamValidation),
  DiscussionController.getProjectThreads
);
router.post(
  '/project/:projectId',
  validate(DiscussionController.createThreadValidation),
  DiscussionController.createThread
);

// Messages inside a single discussion thread
router.get(
  '/project/:projectId/:threadId/replies',
  validate(DiscussionController.threadParamValidation),
  DiscussionController.getThreadReplies
);
router.post(
  '/project/:projectId/:threadId/replies',
  validate(DiscussionController.createReplyValidation),
  DiscussionController.createReply
);

export default router;
