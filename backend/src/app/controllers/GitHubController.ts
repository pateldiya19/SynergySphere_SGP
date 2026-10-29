import crypto from 'crypto';
import { Request, Response } from 'express';
import { config } from '@/config';
import { GitHubWebhookDelivery, Project, Task } from '@/models';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { TaskProofService } from '@/services/TaskProofService';
import { logger, ResponseUtils } from '@/utils';
import { emitToProject } from '@/infrastructure/socket';

const taskReference = /(?:^|[^A-Z0-9])(?:\[)?(TASK-\d+)(?:\])?(?=$|[^A-Z0-9])/gi;

export function findTaskKeys(...values: unknown[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(taskReference)) {
      keys.add(match[1].toUpperCase());
    }
  }
  return [...keys];
}

export function findTaskKey(...values: unknown[]): string | null {
  return findTaskKeys(...values)[0] || null;
}

export async function applyPullRequestTaskAutomation(
  task: any,
  projectId: string,
  action: string,
  merged: boolean,
  metadata: Record<string, unknown>
): Promise<void> {
  const previousStatus = task.status;
  const nextStatus = action === 'opened' && previousStatus === 'todo' ? 'in_progress' : null;

  if (!nextStatus) return;

  logger.info(
    `GitHub automation: updating task ${task._id.toString()} from ${previousStatus} to ${nextStatus}`
  );
  task.status = nextStatus;
  const savedTask = await task.save();
  logger.info(
    `GitHub automation: task update result ${JSON.stringify({ id: savedTask._id.toString(), taskKey: savedTask.taskKey, status: savedTask.status })}`
  );
  await TaskHistoryService.record({
    taskId: task._id.toString(),
    projectId,
    type: 'STATUS_CHANGED',
    source: 'github',
    description: `GitHub pull request ${action}${merged ? ' merged' : ''}: status changed from ${previousStatus} to ${nextStatus}`,
    changes: { status: { before: previousStatus, after: nextStatus } },
    metadata: { ...metadata, automation: true },
  });
  emitToProject(projectId, 'task:status-changed', {
    projectId,
    task: { id: task._id.toString(), taskKey: task.taskKey, status: nextStatus },
    source: 'github',
  });
}

export function isValidSignature(req: Request): boolean {
  const signature = req.header('x-hub-signature-256');
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!config.GITHUB_WEBHOOK_SECRET || !signature || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', config.GITHUB_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
  return (
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}

export class GitHubController {
  static webhookConfig(_req: Request, res: Response): void {
    ResponseUtils.success(res, { url: config.GITHUB_WEBHOOK_URL });
  }

  static async webhook(req: Request, res: Response): Promise<void> {
    if (!isValidSignature(req)) {
      ResponseUtils.unauthorized(res, 'Invalid GitHub webhook signature');
      return;
    }
    const deliveryId = req.header('x-github-delivery');
    if (!deliveryId) {
      ResponseUtils.error(res, 'GitHub delivery ID is required', 400);
      return;
    }

    try {
      let payload = req.body;
      if (req.is('application/x-www-form-urlencoded')) {
        try {
          payload = JSON.parse(req.body?.payload || '');
        } catch {
          ResponseUtils.error(res, 'Invalid GitHub form payload', 400);
          return;
        }
      }
      const repository = payload?.repository;
      const owner = repository?.owner?.login || repository?.owner?.name;
      if (typeof owner !== 'string' || typeof repository?.name !== 'string') {
        ResponseUtils.error(res, 'Invalid GitHub repository payload', 400);
        return;
      }
      const event = req.header('x-github-event');
      logger.info(
        `GitHub webhook received: ${event || 'unknown'} repository=${owner}/${repository.name} delivery=${deliveryId}`
      );
      if (!['push', 'pull_request'].includes(event || '')) {
        ResponseUtils.success(res, null, 'GitHub event ignored');
        return;
      }
      try {
        await GitHubWebhookDelivery.create({ deliveryId });
      } catch (error: any) {
        if (error.code === 11000) {
          ResponseUtils.success(res, null, 'Webhook already processed');
          return;
        }
        throw error;
      }
      const normalizedOwner = owner.toLowerCase();
      const normalizedRepositoryName = repository.name.toLowerCase();
      const repositoryUrl = `https://github.com/${normalizedOwner}/${normalizedRepositoryName}`;
      const project = await Project.findOne({
        isActive: true,
        $or: [
          { 'github.owner': normalizedOwner, 'github.name': normalizedRepositoryName },
          {
            'github.owner': normalizedOwner,
            'github.name': { $in: [repositoryUrl, `${repositoryUrl}.git`] },
          },
          { 'github.url': { $in: [repositoryUrl, `${repositoryUrl}.git`] } },
          { 'github.repositoryId': repository.id },
        ],
      });
      logger.info(
        `GitHub repository match: repository=${owner}/${repository.name} project=${project ? (project as any)._id.toString() : 'none'}`
      );
      if (!project) {
        ResponseUtils.success(res, null, 'Repository is not connected');
        return;
      }

      // Bookkeeping for the project page's "last delivery" indicator. Failing
      // to record it must never cost us the delivery itself, which carries the
      // actual development evidence.
      await Project.updateOne(
        { _id: project._id },
        { $set: { 'github.lastDeliveryAt': new Date(), 'github.lastDeliveryEvent': event } },
        { timestamps: false }
      ).catch((error: any) =>
        logger.warn(`Could not record last webhook delivery: ${error.message}`)
      );

      if (event === 'push') {
        for (const commit of payload.commits || []) {
          const keys = findTaskKeys(
            payload.ref,
            commit.message,
            ...(commit.added || []),
            ...(commit.modified || [])
          );
          for (const key of keys) {
            const task = await Task.findOne({ projectId: project._id, taskKey: key });
            if (!task) continue;
            await TaskProofService.updateGitHubProof(task, {
              repository: `${normalizedOwner}/${normalizedRepositoryName}`,
              branch: String(payload.ref || '').replace(/^refs\/heads\//, ''),
              commits: [{ sha: commit.id, message: commit.message, url: commit.url }],
            });
            await TaskHistoryService.record({
              taskId: (task as any)._id.toString(),
              projectId: (project as any)._id.toString(),
              type: 'GIT_COMMIT',
              source: 'github',
              description: `Git commit detected: ${String(commit.message).split('\n')[0].slice(0, 200)}`,
              metadata: {
                deliveryId,
                sha: commit.id,
                message: String(commit.message).slice(0, 1000),
                author: commit.author?.name,
                repository: `${owner}/${repository.name}`,
                url: commit.url,
                branch: payload.ref,
              },
            });
          }
        }
      }
      if (event === 'pull_request') {
        const pr = payload.pull_request;
        const keys = findTaskKeys(pr?.title, pr?.body, pr?.head?.ref);
        logger.info(
          `GitHub pull request parsed: action=${String(payload.action || 'unknown')} keys=${keys.join(',') || 'none'} title=${String(pr?.title || '')} branch=${String(pr?.head?.ref || '')}`
        );
        const type =
          payload.action === 'closed' && pr.merged
            ? 'PULL_REQUEST_MERGED'
            : payload.action === 'closed'
              ? 'PULL_REQUEST_CLOSED'
              : payload.action === 'opened'
                ? 'PULL_REQUEST_CREATED'
                : 'PULL_REQUEST_UPDATED';
        for (const key of keys) {
          const task = await Task.findOne({
            projectId: project._id,
            $or: [{ taskKey: key }, { title: key }],
          });
          logger.info(
            `GitHub task match: key=${key} task=${task ? (task as any)._id.toString() : 'none'} title=${task?.title || 'none'} taskKey=${task?.taskKey || 'none'} status=${task?.status || 'none'}`
          );
          if (!task) continue;
          const metadata = {
            deliveryId,
            pullRequestNumber: pr.number,
            title: String(pr.title).slice(0, 500),
            author: pr.user?.login,
            repository: `${owner}/${repository.name}`,
            branch: pr.head?.ref,
            url: pr.html_url,
            state: pr.merged ? 'merged' : pr.state,
            merged: Boolean(pr.merged),
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            commits: pr.commits,
          };
          await TaskProofService.updateGitHubProof(task, {
            url: pr.html_url,
            repository: `${normalizedOwner}/${normalizedRepositoryName}`,
            state: pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
            pullRequestNumber: pr.number,
            pullRequestTitle: String(pr.title).slice(0, 500),
            pullRequestAuthor: pr.user?.login,
            // The numeric id is what author verification matches on; the
            // login is kept for display and for older stored proofs.
            pullRequestAuthorId: typeof pr.user?.id === 'number' ? pr.user.id : undefined,
            branch: pr.head?.ref,
            commitCount: typeof pr.commits === 'number' ? pr.commits : undefined,
            filesChanged: typeof pr.changed_files === 'number' ? pr.changed_files : undefined,
            additions: typeof pr.additions === 'number' ? pr.additions : undefined,
            deletions: typeof pr.deletions === 'number' ? pr.deletions : undefined,
            merged: Boolean(pr.merged),
          });
          await TaskHistoryService.record({
            taskId: (task as any)._id.toString(),
            projectId: (project as any)._id.toString(),
            type,
            source: 'github',
            description: `${type.replace(/_/g, ' ').toLowerCase()}: #${pr.number} ${String(pr.title).slice(0, 180)}`,
            metadata,
          });
          await applyPullRequestTaskAutomation(
            task,
            (project as any)._id.toString(),
            payload.action,
            Boolean(pr.merged),
            metadata
          );
        }
      }
      ResponseUtils.success(res, null, 'GitHub webhook processed');
    } catch (error: any) {
      if (deliveryId) await GitHubWebhookDelivery.deleteOne({ deliveryId }).catch(() => undefined);
      ResponseUtils.serverError(res, error.message);
    }
  }
}
