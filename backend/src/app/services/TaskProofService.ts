import { User } from '@/models';
import { emitToProject } from '@/infrastructure/socket';

type GitHubProofUpdate = {
  url?: string;
  repository?: string;
  pullRequestNumber?: number;
  pullRequestTitle?: string;
  pullRequestAuthor?: string;
  pullRequestAuthorId?: number;
  branch?: string;
  commits?: Array<{ sha?: string; message?: string; url?: string }>;
  commitCount?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  merged?: boolean;
  state?: 'open' | 'closed' | 'merged';
};

/** The assignee's OAuth-verified GitHub account, as far as we can establish it. */
export type AssigneeGitHubIdentity = {
  id?: number;
  login?: string;
};

export class TaskProofService {
  /**
   * Resolve the assignee's *verified* GitHub identity, if any.
   *
   * Only `user.github`, written by the OAuth callback, is consulted. The legacy
   * self-declared `user.githubLogin` is deliberately ignored here: it is
   * attacker-controlled input, so trusting it meant anyone could type a
   * colleague's username and have their commits reported as verified-authored.
   *
   * Returns null when the task is unassigned or the assignee has not linked an
   * account, which leaves author verification indeterminate rather than failed
   * -- "we cannot tell" and "the wrong person wrote this" are different claims
   * and a reviewer needs to see which one applies.
   */
  static async resolveAssigneeGitHubIdentity(task: any): Promise<AssigneeGitHubIdentity | null> {
    const assignee = task?.assigneeId;
    if (!assignee) return null;

    // assigneeId may already be populated by the caller's query.
    if (typeof assignee === 'object' && assignee.github && assignee.github.id) {
      return {
        id: Number(assignee.github.id),
        login:
          typeof assignee.github.login === 'string'
            ? assignee.github.login.toLowerCase()
            : undefined,
      };
    }

    const assigneeId = typeof assignee === 'object' ? assignee._id : assignee;
    if (!assigneeId) return null;

    // A populated assignee without `github` may simply have been selected
    // without that field, so fall through to an explicit read rather than
    // concluding the user is unlinked.
    const user = await User.findById(assigneeId).select('github').lean<any>();
    const github = user?.github;
    if (!github?.id) return null;

    return {
      id: Number(github.id),
      login: typeof github.login === 'string' ? github.login.toLowerCase() : undefined,
    };
  }

  /**
   * Decide whether a pull request's author is the task's assignee.
   *
   * `undefined` means indeterminate: either side may be unknown.
   *
   * Prefers GitHub's immutable numeric account id over the login. A login can
   * be renamed, and once freed it can be claimed by someone else, so a login
   * comparison can both miss a genuine match and accept an impostor. The login
   * path remains for proofs recorded before author ids were captured.
   */
  static matchAuthorToAssignee(
    author: { id?: number; login?: string } | undefined,
    assignee: AssigneeGitHubIdentity | null | undefined
  ): boolean | undefined {
    if (!author || !assignee) return undefined;

    if (author.id && assignee.id) {
      return Number(author.id) === Number(assignee.id);
    }

    if (author.login && assignee.login) {
      return author.login.trim().toLowerCase() === assignee.login.trim().toLowerCase();
    }

    return undefined;
  }

  static async updateGitHubProof(task: any, update: GitHubProofUpdate): Promise<void> {
    if (!task.proofOfWork) task.proofOfWork = [];
    const proofs = task.proofOfWork;
    let proof = update.pullRequestNumber
      ? proofs.find(
          (entry: any) =>
            entry.type === 'github' && entry.pullRequestNumber === update.pullRequestNumber
        )
      : undefined;
    if (!proof && update.branch) {
      proof = proofs.find(
        (entry: any) =>
          entry.type === 'github' &&
          entry.branch === update.branch &&
          (!update.pullRequestNumber ||
            !entry.pullRequestNumber ||
            entry.pullRequestNumber === update.pullRequestNumber)
      );
    }
    if (!proof) {
      task.proofOfWork.push({
        type: 'github',
        source: 'github',
        submittedAt: new Date(),
        commits: [],
      });
      proof = task.proofOfWork[task.proofOfWork.length - 1];
    }

    // Evidence that arrives from the webhook is authoritative: a previously
    // self-reported entry for the same PR/branch is upgraded to verified.
    proof.source = 'github';

    if (update.url) proof.url = update.url;
    if (update.repository) proof.repository = update.repository;
    if (update.pullRequestNumber !== undefined) proof.pullRequestNumber = update.pullRequestNumber;
    if (update.pullRequestTitle !== undefined) proof.pullRequestTitle = update.pullRequestTitle;
    if (update.pullRequestAuthor !== undefined) proof.pullRequestAuthor = update.pullRequestAuthor;
    if (update.pullRequestAuthorId !== undefined)
      proof.pullRequestAuthorId = update.pullRequestAuthorId;
    if (update.branch) proof.branch = update.branch;
    if (update.commitCount !== undefined)
      proof.commitCount = Math.max(proof.commitCount || 0, update.commitCount);
    if (update.filesChanged !== undefined) proof.filesChanged = update.filesChanged;
    if (update.additions !== undefined) proof.additions = update.additions;
    if (update.deletions !== undefined) proof.deletions = update.deletions;
    if (update.merged !== undefined) proof.merged = update.merged;
    if (update.state !== undefined) proof.state = update.state;

    const knownCommitShas = new Set((proof.commits || []).map((commit: any) => String(commit.sha)));
    for (const commit of update.commits || []) {
      if (!commit.sha || knownCommitShas.has(commit.sha)) continue;
      proof.commits.push({ sha: commit.sha, message: commit.message, url: commit.url });
      knownCommitShas.add(commit.sha);
    }
    if (update.commitCount === undefined && proof.commits?.length) {
      proof.commitCount = Math.max(proof.commitCount || 0, proof.commits.length);
    }

    // Verify the author against the assignee whenever we know both sides.
    if (proof.pullRequestAuthor || proof.pullRequestAuthorId) {
      const assignee = await TaskProofService.resolveAssigneeGitHubIdentity(task);
      proof.authorMatchesAssignee = TaskProofService.matchAuthorToAssignee(
        { id: proof.pullRequestAuthorId, login: proof.pullRequestAuthor },
        assignee
      );
    }

    proof.lastUpdatedAt = new Date();
    await task.save();
    const projectId = String(task.projectId);
    emitToProject(projectId, 'task:updated', {
      projectId,
      task: {
        id: String(task._id),
        taskKey: task.taskKey,
        status: task.status,
        proofOfWork: task.proofOfWork.map((entry: any) => {
          const serialized = typeof entry.toObject === 'function' ? entry.toObject() : entry;
          return {
            ...serialized,
            id: String(entry._id || entry.id || ''),
            submittedBy: entry.submittedBy ? String(entry.submittedBy) : undefined,
          };
        }),
      },
    });
  }
}
