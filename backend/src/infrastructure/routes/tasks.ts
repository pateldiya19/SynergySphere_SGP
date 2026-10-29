import { Router } from 'express';
import { TaskController } from '@/controllers/TaskController';
import {
  handleTaskAttachmentUpload,
  TaskAttachmentController,
} from '@/controllers/TaskAttachmentController';
import { TaskProofController } from '@/controllers/TaskProofController';
import { TaskCommentController } from '@/controllers/TaskCommentController';
import { authenticate, validate } from '@/middleware';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Task routes
router.get('/my-tasks', TaskController.getMyTasks);
router.get(
  '/project/:projectId',
  validate(TaskController.getTasksValidation),
  TaskController.getTasks
);
router.post('/', validate(TaskController.createValidation), TaskController.createTask);

// Task comments
router.get(
  '/:id/comments',
  validate(TaskCommentController.taskIdValidation),
  TaskCommentController.list
);
router.post(
  '/:id/comments',
  validate([...TaskCommentController.taskIdValidation, ...TaskCommentController.bodyValidation]),
  TaskCommentController.create
);
router.put(
  '/:id/comments/:commentId',
  validate([...TaskCommentController.commentIdValidation, ...TaskCommentController.bodyValidation]),
  TaskCommentController.update
);
router.delete(
  '/:id/comments/:commentId',
  validate(TaskCommentController.commentIdValidation),
  TaskCommentController.remove
);

router.post(
  '/:id/attachments',
  validate(TaskAttachmentController.taskIdValidation),
  handleTaskAttachmentUpload,
  TaskAttachmentController.upload
);
router.get(
  '/:id/attachments/:attachmentId/download',
  validate(TaskAttachmentController.attachmentIdValidation),
  TaskAttachmentController.download
);
router.delete(
  '/:id/attachments/:attachmentId',
  validate(TaskAttachmentController.attachmentIdValidation),
  TaskAttachmentController.remove
);
router.post(
  '/:id/proofs',
  validate(TaskProofController.submitValidation),
  TaskProofController.submit
);
router.post(
  '/:id/proofs/review',
  validate(TaskProofController.reviewValidation),
  TaskProofController.review
);
router.get('/:id', TaskController.getTask);
router.get('/:id/history', TaskController.getTaskHistory);
router.post(
  '/:id/dependencies',
  validate(TaskController.dependencyValidation),
  TaskController.addDependency
);
router.delete(
  '/:id/dependencies/:dependencyId',
  validate(TaskController.removeDependencyValidation),
  TaskController.removeDependency
);
router.put('/:id', validate(TaskController.updateValidation), TaskController.updateTask);
router.delete('/:id', TaskController.deleteTask);

// Task status update
router.patch('/:id/status', TaskController.updateTaskStatus);

export default router;
