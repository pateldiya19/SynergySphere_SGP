import { Response } from 'express';
import { body, param } from 'express-validator';
import { Task, User } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { NotificationService } from '@/services/NotificationService';
import { EmailService } from '@/services/EmailService';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { TaskProofService } from '@/services/TaskProofService';
import { emitToProject } from '@/infrastructure/socket';
import {
  formatRepositoryFullName,
  parseGitHubEvidenceUrl,
  repositoriesMatch,
  resolveProjectRepository,
  ResponseUtils,
} from '@/utils';

const taskIdRule = param('id').isMongoId().withMessage('Invalid task ID');

function reviewerCanAct(project: any, userId: string): boolean {
  return (
    String(project.ownerId) === userId ||
    project.members.some(
      (member: any) => String(member.userId) === userId && member.role === 'manager'
    )
  );
}

function userCanAccessProject(project: any, userId: string): boolean {
  return (
    String(project.ownerId) === userId ||
    project.members.some((member: any) => String(member.userId) === userId)
  );
}

async function findTaskForProject(taskId: string): Promise<any | null> {
  const task = await Task.findById(taskId).populate(
    'projectId',
    'name ownerId members isActive github'
  );
  if (!task) return null;
  const project = task.projectId as any;
  return project?.isActive ? task : null;
}

async function populatedTask(taskId: string): Promise<any> {
  return Task.findById(taskId)
    .populate('projectId', 'name ownerId members github')
    .populate('assigneeId', 'name email avatarUrl github githubLogin')
    .populate('dependencies', 'taskKey title status')
    .populate('proofOfWork.submittedBy', 'name email avatarUrl')
    .populate('proofReviews.reviewerId', 'name email avatarUrl')
    .populate('attachments.uploaderId', 'name');
}

export class TaskProofController {
  static submitValidation = [
    taskIdRule,
    body('type')
      .isIn(['github', 'demo_url', 'developer_notes'])
      .withMessage('Unsupported proof type'),
    body('url')
      .optional()
      .isURL({ require_protocol: true, protocols: ['http', 'https'] })
      .withMessage('Proof URL must be valid'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Developer notes cannot exceed 5000 characters'),
  ];

  static reviewValidation = [
    taskIdRule,
    body('decision').isIn(['approved', 'changes_requested']).withMessage('Invalid review decision'),
    body('comment')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Review comment cannot exceed 2000 characters'),
  ];

  static async submit(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findTaskForProject(req.params.id);
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or project unavailable');
        return;
      }
      if (!userCanAccessProject(task.projectId, String(req.user._id))) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }
      if (String((task as any).assigneeId || '') !== String(req.user._id)) {
        ResponseUtils.forbidden(res, 'Only the task assignee can submit proof');
        return;
      }
      if (task.status !== 'in_progress') {
        ResponseUtils.error(res, 'Proof can only be submitted while the task is in progress', 409);
        return;
      }

      const { type, url, notes } = req.body;
      const proofs = (task as any).proofOfWork || [];
      if ((task as any).requiresGitHubEvidence && type !== 'github') {
        ResponseUtils.error(
          res,
          'GitHub evidence is required before this task can be submitted for review',
          400
        );
        return;
      }
      let existingGitHubProof: any;
      let submittedRepository: string | undefined;
      let submittedPullRequestNumber: number | undefined;
      if (type === 'github') {
        if (url) {
          const parsedUrl = parseGitHubEvidenceUrl(url);
          if (!parsedUrl) {
            ResponseUtils.error(
              res,
              'GitHub proof must link to a pull request or commit on github.com',
              400
            );
            return;
          }

          // Proof must come from the repository this project is connected to,
          // otherwise any public pull request could be passed off as evidence.
          const projectRepository = resolveProjectRepository((task.projectId as any).github);
          if (!projectRepository) {
            ResponseUtils.error(
              res,
              'Connect a GitHub repository to this project before submitting GitHub proof',
              400
            );
            return;
          }
          if (!repositoriesMatch(parsedUrl, projectRepository)) {
            ResponseUtils.error(
              res,
              `GitHub proof must come from ${projectRepository.owner}/${projectRepository.name}, but this link points to ${parsedUrl.owner}/${parsedUrl.name}`,
              400
            );
            return;
          }

          submittedRepository = formatRepositoryFullName(parsedUrl.owner, parsedUrl.name);
          submittedPullRequestNumber = parsedUrl.pullRequestNumber;
          existingGitHubProof = proofs.find(
            (proof: any) => proof.type === 'github' && proof.url === url
          );
        } else {
          // No URL supplied: submit the GitHub evidence the webhook already
          // collected for this task. Verified evidence is preferred so the
          // reviewer sees the authoritative record.
          const hasEvidence = (proof: any) =>
            proof.type === 'github' &&
            (proof.url || proof.pullRequestNumber || proof.commits?.length);
          const reversedProofs = [...proofs].reverse();
          existingGitHubProof =
            reversedProofs.find((proof: any) => proof.source === 'github' && hasEvidence(proof)) ||
            reversedProofs.find(hasEvidence);
          if (!existingGitHubProof) {
            ResponseUtils.error(
              res,
              'No GitHub activity has been linked to this task yet. Push a commit or open a pull request that references the task key, or paste the pull request URL.',
              400
            );
            return;
          }
        }
      } else if (type === 'demo_url' && !url) {
        ResponseUtils.error(res, 'A demo URL is required', 400);
        return;
      } else if (type === 'developer_notes' && !notes?.trim()) {
        ResponseUtils.error(res, 'Developer notes are required', 400);
        return;
      }

      const project = task.projectId as any;
      if (existingGitHubProof) {
        existingGitHubProof.submittedBy = req.user._id;
        existingGitHubProof.submittedAt = new Date();
        if (submittedRepository && !existingGitHubProof.repository) {
          existingGitHubProof.repository = submittedRepository;
        }
        if (submittedPullRequestNumber && !existingGitHubProof.pullRequestNumber) {
          existingGitHubProof.pullRequestNumber = submittedPullRequestNumber;
        }
      } else {
        proofs.push({
          type,
          source: 'user',
          submittedBy: req.user._id,
          submittedAt: new Date(),
          url,
          notes,
          ...(submittedRepository ? { repository: submittedRepository } : {}),
          ...(submittedPullRequestNumber ? { pullRequestNumber: submittedPullRequestNumber } : {}),
        });
        (task as any).proofOfWork = proofs;
      }

      // Re-evaluate author verification so evidence collected before the
      // assignee linked their GitHub account resolves on submission.
      const assigneeIdentity = await TaskProofService.resolveAssigneeGitHubIdentity(task);
      for (const proof of proofs) {
        if (proof.type !== 'github') continue;
        if (!proof.pullRequestAuthor && !proof.pullRequestAuthorId) continue;
        proof.authorMatchesAssignee = TaskProofService.matchAuthorToAssignee(
          { id: proof.pullRequestAuthorId, login: proof.pullRequestAuthor },
          assigneeIdentity
        );
      }

      const previousStatus = task.status;
      task.status = 'ready_for_review';
      await task.save();
      const taskId = String(task._id);
      const projectId = String(project._id);
      await TaskHistoryService.record({
        taskId,
        projectId,
        actorId: String(req.user._id),
        type: 'STATUS_CHANGED',
        source: 'user',
        description: 'Proof submitted for review',
        changes: { status: { before: previousStatus, after: 'ready_for_review' } },
        metadata: { workflow: 'proof_submission', proofType: type },
      });

      const recipients = new Set<string>([
        String(project.ownerId),
        ...project.members
          .filter((member: any) => member.role === 'manager')
          .map((member: any) => String(member.userId)),
      ]);
      recipients.delete(String(req.user._id));
      await NotificationService.createMany(
        [...recipients].map(userId => ({
          userId,
          type: 'task_status_changed' as const,
          title: 'Task ready for review',
          message: `${(task as any).title} has proof ready for review`,
          payload: {
            projectId,
            taskId,
            taskKey: (task as any).taskKey,
            status: 'ready_for_review',
          },
        }))
      );

      // Email the same reviewers, on top of the in-app notification. Not
      // awaited: a slow or unconfigured mail server must not delay the
      // submission response.
      void (async () => {
        const reviewers = await User.find({ _id: { $in: [...recipients] } })
          .select('email')
          .lean<Array<{ email: string }>>();
        for (const reviewer of reviewers) {
          await EmailService.sendReviewRequest({
            to: reviewer.email,
            submitterName: req.user.name,
            taskTitle: (task as any).title,
            taskKey: (task as any).taskKey,
            projectName: project.name,
            taskId,
          });
        }
      })();

      const result = await populatedTask(taskId);
      emitToProject(projectId, 'task:updated', { projectId, task: result });
      ResponseUtils.success(res, result, 'Proof submitted for review');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async review(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findTaskForProject(req.params.id);
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or project unavailable');
        return;
      }
      const project = task.projectId as any;
      if (!userCanAccessProject(project, String(req.user._id))) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }
      if (!reviewerCanAct(project, String(req.user._id))) {
        ResponseUtils.forbidden(res, 'Only the project owner or a manager can review task proof');
        return;
      }
      if (task.status !== 'ready_for_review') {
        ResponseUtils.error(res, 'Task is not waiting for review', 409);
        return;
      }

      const { decision, comment } = req.body;
      if (decision === 'changes_requested' && !comment?.trim()) {
        ResponseUtils.error(res, 'A reason is required when requesting changes', 400);
        return;
      }
      // A pasted link is not enough for tasks that require GitHub evidence:
      // the proof must have been delivered by the signed GitHub webhook.
      if (
        decision === 'approved' &&
        (task as any).requiresGitHubEvidence &&
        !(task as any).proofOfWork?.some(
          (proof: any) =>
            proof.type === 'github' &&
            proof.source === 'github' &&
            (proof.url || proof.pullRequestNumber || proof.commits?.length)
        )
      ) {
        ResponseUtils.error(
          res,
          'Verified GitHub evidence is required before this task can be completed. Self-reported links cannot be approved; push a commit or open a pull request referencing this task so the GitHub webhook can verify it.',
          400
        );
        return;
      }
      if (
        decision === 'approved' &&
        (await Task.exists({ _id: { $in: task.dependencies || [] }, status: { $ne: 'done' } }))
      ) {
        ResponseUtils.error(
          res,
          'Cannot approve completion while dependencies are incomplete',
          400
        );
        return;
      }

      const previousStatus = task.status;
      const nextStatus = decision === 'approved' ? 'done' : 'changes_requested';
      task.status = nextStatus;
      (task as any).proofReviews.push({
        reviewerId: req.user._id,
        decision,
        comment,
        reviewedAt: new Date(),
      });
      await task.save();

      const taskId = String(task._id);
      const projectId = String(project._id);
      await TaskHistoryService.record({
        taskId,
        projectId,
        actorId: String(req.user._id),
        type: decision === 'approved' ? 'TASK_COMPLETED' : 'STATUS_CHANGED',
        source: 'user',
        description:
          decision === 'approved'
            ? 'Proof approved; task completed'
            : 'Changes requested on submitted proof',
        changes: { status: { before: previousStatus, after: nextStatus } },
        metadata: { workflow: decision, comment },
      });

      const assigneeId = String((task as any).assigneeId || '');
      if (assigneeId && assigneeId !== String(req.user._id)) {
        await NotificationService.create({
          userId: assigneeId,
          type: decision === 'approved' ? 'task_completed' : 'task_status_changed',
          title: decision === 'approved' ? 'Task proof approved' : 'Changes requested',
          message:
            decision === 'approved'
              ? `${(task as any).title} was approved and completed`
              : `Changes requested for ${(task as any).title}: ${comment}`,
          payload: { projectId, taskId, taskKey: (task as any).taskKey, status: nextStatus },
        });
      }

      const result = await populatedTask(taskId);
      emitToProject(projectId, 'task:updated', { projectId, task: result });
      emitToProject(projectId, 'task:status-changed', { projectId, task: result });
      ResponseUtils.success(
        res,
        result,
        decision === 'approved' ? 'Proof approved and task completed' : 'Changes requested'
      );
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
