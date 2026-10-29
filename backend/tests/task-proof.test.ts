import crypto from 'crypto';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { Notification, Project, Task, TaskHistory, User } from '../src/app/models';

describe('Task proof and review workflow', () => {
  let app: Express;
  let ownerToken: string;
  let managerToken: string;
  let memberToken: string;
  let assigneeToken: string;
  let outsiderToken: string;
  let ownerId: string;
  let managerId: string;
  let memberId: string;
  let assigneeId: string;
  let projectId: string;
  let taskId: string;
  let unlinkedProjectId: string;
  let unlinkedTaskId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const WEBHOOK_SECRET = 'proof-verification-secret';

  /** The GitHub account the assignee links in these tests. */
  const DEV_GITHUB_ID = 4242;
  const DEV_GITHUB_LOGIN = 'dev-account';

  /**
   * Link a verified GitHub identity the way the OAuth callback does.
   *
   * Written directly to the document on purpose: there is no API that lets a
   * client assert its own GitHub identity, which is the property under test.
   */
  async function linkVerifiedGitHub(
    userId: string,
    identity: { id: number; login: string } = { id: DEV_GITHUB_ID, login: DEV_GITHUB_LOGIN }
  ) {
    await User.findByIdAndUpdate(userId, {
      $set: { github: { ...identity, linkedAt: new Date() } },
      $unset: { githubLogin: 1 },
    });
  }

  beforeAll(() => {
    config.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = createApp() as Express;
  });

  /** Deliver a signed pull_request event exactly as GitHub would. */
  async function deliverPullRequest(options: {
    taskKey: string;
    deliveryId: string;
    authorLogin: string;
    /** GitHub's numeric account id; omit to simulate a payload without one. */
    authorId?: number | null;
    repository?: { owner: string; name: string };
    action?: 'opened' | 'synchronize' | 'closed';
    merged?: boolean;
    number?: number;
  }) {
    const repository = options.repository || { owner: 'acme', name: 'repo' };
    const action = options.action || 'opened';
    const number = options.number ?? 42;
    const payload = {
      action,
      number,
      pull_request: {
        number,
        state: action === 'closed' ? 'closed' : 'open',
        merged: Boolean(options.merged),
        title: `${options.taskKey} Implement the feature`,
        body: `Resolves ${options.taskKey}`,
        html_url: `https://github.com/${repository.owner}/${repository.name}/pull/${number}`,
        user: {
          login: options.authorLogin,
          ...(options.authorId === null ? {} : { id: options.authorId ?? DEV_GITHUB_ID }),
        },
        head: { ref: `${options.taskKey}-feature` },
        additions: 245,
        deletions: 31,
        changed_files: 8,
        commits: 5,
      },
      repository: {
        id: 987654,
        name: repository.name,
        owner: { login: repository.owner },
      },
    };
    const rawBody = JSON.stringify(payload);
    return request(app)
      .post('/api/github/webhook')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', options.deliveryId)
      .set(
        'X-Hub-Signature-256',
        `sha256=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')}`
      )
      .send(rawBody)
      .expect(200);
  }

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await TaskHistory.deleteMany({});
    await Notification.deleteMany({});

    const register = async (name: string, email: string) =>
      request(app)
        .post('/api/auth/register')
        .send({ name, email, password: 'password123' })
        .expect(201);
    const owner = await register('Proof Owner', 'proof-owner@example.com');
    const manager = await register('Proof Manager', 'proof-manager@example.com');
    const member = await register('Proof Member', 'proof-member@example.com');
    const assignee = await register('Proof Assignee', 'proof-assignee@example.com');
    const outsider = await register('Proof Outsider', 'proof-outsider@example.com');
    ownerToken = owner.body.data.accessToken;
    managerToken = manager.body.data.accessToken;
    memberToken = member.body.data.accessToken;
    assigneeToken = assignee.body.data.accessToken;
    outsiderToken = outsider.body.data.accessToken;
    ownerId = owner.body.data.user.id || owner.body.data.user._id;
    managerId = manager.body.data.user.id || manager.body.data.user._id;
    memberId = member.body.data.user.id || member.body.data.user._id;
    assigneeId = assignee.body.data.user.id || assignee.body.data.user._id;

    const project = await request(app)
      .post('/api/projects')
      .set(auth(ownerToken))
      .send({ name: 'Proof Project', github: { owner: 'acme', name: 'repo' } })
      .expect(201);
    projectId = project.body.data.id;
    for (const userId of [managerId, memberId, assigneeId]) {
      await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(auth(ownerToken))
        .send({ userId })
        .expect(200);
    }
    await request(app)
      .patch(`/api/projects/${projectId}/members/${managerId}`)
      .set(auth(ownerToken))
      .send({ role: 'manager' })
      .expect(200);
    const task = await request(app)
      .post('/api/tasks')
      .set(auth(ownerToken))
      .send({
        projectId,
        title: 'Implement proof workflow',
        assigneeId,
      })
      .expect(201);
    taskId = task.body.data.id;
    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(200);

    // A second project with no GitHub repository connected, for negative cases.
    const unlinkedProject = await request(app)
      .post('/api/projects')
      .set(auth(ownerToken))
      .send({ name: 'Unlinked Project' })
      .expect(201);
    unlinkedProjectId = unlinkedProject.body.data.id;
    await request(app)
      .post(`/api/projects/${unlinkedProjectId}/members`)
      .set(auth(ownerToken))
      .send({ userId: assigneeId })
      .expect(200);
    const unlinkedTask = await request(app)
      .post('/api/tasks')
      .set(auth(ownerToken))
      .send({
        projectId: unlinkedProjectId,
        title: 'Work without a repository',
        assigneeId,
      })
      .expect(201);
    unlinkedTaskId = unlinkedTask.body.data.id;
    await request(app)
      .patch(`/api/tasks/${unlinkedTaskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(200);
  });

  it('limits proof submission to the assignee and completion to owner/manager review', async () => {
    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'done' })
      .expect(403);
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(assigneeToken))
      .send({ status: 'done' })
      .expect(403);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(memberToken))
      .send({ type: 'developer_notes', notes: 'Not assigned' })
      .expect(403);

    const submitted = await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'demo_url', url: 'https://demo.example.com/task-1' })
      .expect(200);
    expect(submitted.body.data.status).toBe('ready_for_review');
    expect(submitted.body.data.proofOfWork[0]).toMatchObject({
      type: 'demo_url',
      url: 'https://demo.example.com/task-1',
    });
    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(400);

    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(memberToken))
      .send({ decision: 'approved' })
      .expect(403);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(ownerToken))
      .send({ decision: 'approved' })
      .expect(200);

    const task = await Task.findById(taskId).lean();
    expect(task?.status).toBe('done');
    expect(task?.proofReviews?.[0]).toMatchObject({
      decision: 'approved',
      reviewerId: expect.anything(),
    });
    expect(
      await TaskHistory.countDocuments({ taskId, description: 'Proof submitted for review' })
    ).toBe(1);
    expect(await TaskHistory.countDocuments({ taskId, type: 'TASK_COMPLETED' })).toBe(1);
    expect(await Notification.exists({ userId: assigneeId, type: 'task_completed' })).toBeTruthy();
    expect(
      await Notification.exists({ userId: ownerId, message: /proof ready for review/ })
    ).toBeTruthy();
  });

  it('supports requesting changes and resubmitting proof; managers can approve', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'developer_notes', notes: 'Initial implementation details' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(managerToken))
      .send({ decision: 'changes_requested', comment: 'Please add validation coverage.' })
      .expect(200);

    let task = await Task.findById(taskId).lean();
    expect(task?.status).toBe('changes_requested');
    expect(
      await Notification.exists({ userId: assigneeId, message: /Please add validation coverage/ })
    ).toBeTruthy();
    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'done' })
      .expect(403);

    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'developer_notes', notes: 'Added validation coverage.' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(managerToken))
      .send({ decision: 'approved' })
      .expect(200);

    task = await Task.findById(taskId).lean();
    expect(task?.status).toBe('done');
    expect(task?.proofOfWork).toHaveLength(2);
    expect(task?.proofReviews?.map(review => review.decision)).toEqual([
      'changes_requested',
      'approved',
    ]);
  });

  it('keeps completion dependency-gated and rejects direct review-state transitions', async () => {
    const dependency = await Task.create({
      projectId,
      taskKey: 'TASK-DEPENDENCY',
      title: 'Unfinished dependency',
    });
    await Task.findByIdAndUpdate(taskId, { dependencies: [dependency._id] });
    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'ready_for_review' })
      .expect(400);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'developer_notes', notes: 'Work is ready.' })
      .expect(200);

    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(ownerToken))
      .send({ decision: 'approved' })
      .expect(400);
    expect((await Task.findById(taskId))?.status).toBe('ready_for_review');
  });

  it('requires GitHub evidence for configured development tasks but keeps other tasks manual-proof compatible', async () => {
    const configuredTask = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(auth(ownerToken))
      .send({ requiresGitHubEvidence: true })
      .expect(200);
    expect(configuredTask.body.data.requiresGitHubEvidence).toBe(true);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'developer_notes', notes: 'Implementation complete.' })
      .expect(400);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'github', url: 'https://github.com/acme/repo/pull/42' })
      .expect(200);
    const task = await Task.findById(taskId).lean();
    expect(task?.status).toBe('ready_for_review');
    expect(task?.proofOfWork?.[0]).toMatchObject({
      type: 'github',
      source: 'user',
      url: 'https://github.com/acme/repo/pull/42',
    });

    // A self-reported link is submittable but cannot complete the task.
    const selfReportedApproval = await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(ownerToken))
      .send({ decision: 'approved' })
      .expect(400);
    expect(selfReportedApproval.body.error).toMatch(/Verified GitHub evidence is required/);
    expect((await Task.findById(taskId))?.status).toBe('ready_for_review');

    // Verified webhook evidence unlocks approval.
    await deliverPullRequest({
      taskKey: 'TASK-1',
      deliveryId: 'proof-required-1',
      authorLogin: 'dev-account',
    });
    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set(auth(ownerToken))
      .send({ decision: 'approved' })
      .expect(200);
    expect((await Task.findById(taskId))?.status).toBe('done');

    const nonDevelopmentTask = await request(app)
      .post('/api/tasks')
      .set(auth(ownerToken))
      .send({
        projectId,
        title: 'Write project notes',
        assigneeId,
      })
      .expect(201);
    const taskIdWithoutGitHubRequirement = nonDevelopmentTask.body.data.id;
    await request(app)
      .patch(`/api/tasks/${taskIdWithoutGitHubRequirement}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${taskIdWithoutGitHubRequirement}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'developer_notes', notes: 'Notes are complete.' })
      .expect(200);
  });

  it('accepts only supported evidence types and valid proof data', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'screenshot', notes: 'Not supported' })
      .expect(422);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'developer_notes', notes: '   ' })
      .expect(400);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(assigneeToken))
      .send({ type: 'github', url: 'https://example.com/not-github' })
      .expect(400);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set(auth(outsiderToken))
      .send({ type: 'demo_url', url: 'https://demo.example.com/proof' })
      .expect(404);
  });

  describe('GitHub repository binding and evidence verification', () => {
    it('rejects GitHub proof that points at a repository the project is not connected to', async () => {
      const response = await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github', url: 'https://github.com/facebook/react/pull/1' })
        .expect(400);
      expect(response.body.error).toMatch(/must come from acme\/repo/);
      expect(response.body.error).toMatch(/facebook\/react/);

      const task = await Task.findById(taskId).lean();
      expect(task?.status).toBe('in_progress');
      expect(task?.proofOfWork).toHaveLength(0);
    });

    it('accepts GitHub proof from the connected repository and records the repository', async () => {
      await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github', url: 'https://github.com/acme/repo/pull/42' })
        .expect(200);

      const task = await Task.findById(taskId).lean();
      expect(task?.status).toBe('ready_for_review');
      expect(task?.proofOfWork?.[0]).toMatchObject({
        type: 'github',
        source: 'user',
        repository: 'acme/repo',
      });
    });

    it('accepts a commit URL from the connected repository and matches case-insensitively', async () => {
      await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({
          type: 'github',
          url: 'https://github.com/ACME/Repo/commit/0a1b2c3d4e5f6071829304a5b6c7d8e9f0a1b2c3',
        })
        .expect(200);

      const task = await Task.findById(taskId).lean();
      expect(task?.proofOfWork?.[0]).toMatchObject({ type: 'github', repository: 'acme/repo' });
    });

    it('rejects GitHub proof when the project has no repository connected', async () => {
      const response = await request(app)
        .post(`/api/tasks/${unlinkedTaskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github', url: 'https://github.com/acme/repo/pull/42' })
        .expect(400);
      expect(response.body.error).toMatch(/Connect a GitHub repository/);
      expect((await Task.findById(unlinkedTaskId))?.status).toBe('in_progress');
    });

    it('still accepts non-GitHub proof on a project without a connected repository', async () => {
      await request(app)
        .post(`/api/tasks/${unlinkedTaskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'developer_notes', notes: 'Documented the rollout plan.' })
        .expect(200);
      expect((await Task.findById(unlinkedTaskId))?.status).toBe('ready_for_review');
    });

    it('persists repository, pull request state and code change metrics from webhook evidence', async () => {
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-metadata-1',
        authorLogin: 'dev-account',
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof).toMatchObject({
        type: 'github',
        source: 'github',
        repository: 'acme/repo',
        pullRequestNumber: 42,
        pullRequestAuthor: 'dev-account',
        state: 'open',
        branch: 'TASK-1-feature',
        commitCount: 5,
        filesChanged: 8,
        additions: 245,
        deletions: 31,
      });
      expect(proof?.url).toBe('https://github.com/acme/repo/pull/42');
    });

    it('records a merged pull request state without completing the task', async () => {
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-merged-1',
        authorLogin: 'dev-account',
        action: 'closed',
        merged: true,
      });

      const task = await Task.findById(taskId).lean();
      expect(task?.status).toBe('in_progress');
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof).toMatchObject({ state: 'merged', merged: true });
    });

    it('confirms the author when the assignee has linked a matching GitHub account', async () => {
      await linkVerifiedGitHub(assigneeId);
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-author-match',
        authorLogin: 'Dev-Account',
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof?.pullRequestAuthor).toBe('Dev-Account');
      expect(proof?.authorMatchesAssignee).toBe(true);
    });

    it('flags an author that does not match the assigned developer', async () => {
      await linkVerifiedGitHub(assigneeId);
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-author-mismatch',
        authorLogin: 'someone-else',
        authorId: 9999,
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof?.authorMatchesAssignee).toBe(false);
    });

    it('rejects a self-declared GitHub username instead of trusting it', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set(auth(assigneeToken))
        .send({ githubLogin: 'dev-account' })
        .expect(400);
      expect(response.body.error).toMatch(/cannot be set directly/i);

      const stored = await User.findById(assigneeId).lean<any>();
      expect(stored?.githubLogin).toBeUndefined();
      expect(stored?.github?.id).toBeUndefined();
    });

    it('does not verify an author against a legacy self-declared username', async () => {
      // Simulates a row written before linking required OAuth. Such a claim is
      // attacker-supplied, so it must leave verification indeterminate rather
      // than confirming the author.
      await User.findByIdAndUpdate(assigneeId, {
        $set: { githubLogin: 'dev-account' },
        $unset: { github: 1 },
      });
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-legacy-claim',
        authorLogin: 'dev-account',
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof?.authorMatchesAssignee).toBeUndefined();
    });

    it('trusts the immutable account id over a matching login', async () => {
      // The assignee's linked account was renamed and another account took the
      // freed-up login. Comparing logins would wrongly confirm the impostor.
      await linkVerifiedGitHub(assigneeId, { id: DEV_GITHUB_ID, login: 'renamed-account' });
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-login-takeover',
        authorLogin: 'renamed-account',
        authorId: 777000,
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof?.authorMatchesAssignee).toBe(false);
    });

    it('falls back to the login when the payload carries no author id', async () => {
      await linkVerifiedGitHub(assigneeId);
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-no-author-id',
        authorLogin: 'Dev-Account',
        authorId: null,
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof?.pullRequestAuthorId).toBeUndefined();
      expect(proof?.authorMatchesAssignee).toBe(true);
    });

    it('leaves author verification indeterminate when the assignee has not linked GitHub', async () => {
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-author-unlinked',
        authorLogin: 'dev-account',
      });

      const task = await Task.findById(taskId).lean();
      const proof = task?.proofOfWork?.find(entry => entry.source === 'github');
      expect(proof?.pullRequestAuthor).toBe('dev-account');
      expect(proof?.authorMatchesAssignee).toBeUndefined();
    });

    it('resolves author verification on submission when GitHub is linked after the evidence arrived', async () => {
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-late-link',
        authorLogin: 'dev-account',
      });
      expect(
        (await Task.findById(taskId).lean())?.proofOfWork?.[0]?.authorMatchesAssignee
      ).toBeUndefined();

      await linkVerifiedGitHub(assigneeId);
      await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github' })
        .expect(200);

      const task = await Task.findById(taskId).lean();
      expect(task?.proofOfWork?.[0]?.authorMatchesAssignee).toBe(true);
    });

    it('lets a manager approve once verified evidence exists and still blocks self-approval', async () => {
      await request(app)
        .put(`/api/tasks/${taskId}`)
        .set(auth(ownerToken))
        .send({ requiresGitHubEvidence: true })
        .expect(200);
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-manager-approve',
        authorLogin: 'dev-account',
      });
      await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github' })
        .expect(200);

      await request(app)
        .post(`/api/tasks/${taskId}/proofs/review`)
        .set(auth(assigneeToken))
        .send({ decision: 'approved' })
        .expect(403);

      await request(app)
        .post(`/api/tasks/${taskId}/proofs/review`)
        .set(auth(managerToken))
        .send({ decision: 'approved' })
        .expect(200);
      expect((await Task.findById(taskId))?.status).toBe('done');
    });

    it('supports the request-changes loop on verified GitHub evidence', async () => {
      await request(app)
        .put(`/api/tasks/${taskId}`)
        .set(auth(ownerToken))
        .send({ requiresGitHubEvidence: true })
        .expect(200);
      await deliverPullRequest({
        taskKey: 'TASK-1',
        deliveryId: 'verify-changes-loop',
        authorLogin: 'dev-account',
      });
      await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github' })
        .expect(200);

      await request(app)
        .post(`/api/tasks/${taskId}/proofs/review`)
        .set(auth(managerToken))
        .send({ decision: 'changes_requested', comment: 'Please cover the error path.' })
        .expect(200);
      expect((await Task.findById(taskId))?.status).toBe('changes_requested');

      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .set(auth(assigneeToken))
        .send({ status: 'in_progress' })
        .expect(200);
      await request(app)
        .post(`/api/tasks/${taskId}/proofs`)
        .set(auth(assigneeToken))
        .send({ type: 'github' })
        .expect(200);
      await request(app)
        .post(`/api/tasks/${taskId}/proofs/review`)
        .set(auth(managerToken))
        .send({ decision: 'approved' })
        .expect(200);

      const task = await Task.findById(taskId).lean();
      expect(task?.status).toBe('done');
      expect(task?.proofReviews?.map(review => review.decision)).toEqual([
        'changes_requested',
        'approved',
      ]);
    });

    it('reports linking as unconfigured and allows unlinking a verified identity', async () => {
      const clientId = config.GITHUB_OAUTH_CLIENT_ID;
      config.GITHUB_OAUTH_CLIENT_ID = '';
      try {
        const start = await request(app).post('/api/auth/github/start').set(auth(assigneeToken));
        expect(start.status).toBe(503);
        expect(start.body.error).toMatch(/not configured/i);
      } finally {
        config.GITHUB_OAUTH_CLIENT_ID = clientId;
      }

      await linkVerifiedGitHub(assigneeId);
      const status = await request(app)
        .get('/api/auth/github/status')
        .set(auth(assigneeToken))
        .expect(200);
      expect(status.body.data.linked).toMatchObject({ login: DEV_GITHUB_LOGIN });

      await request(app).delete('/api/auth/github/link').set(auth(assigneeToken)).expect(200);
      const after = await User.findById(assigneeId).lean<any>();
      expect(after?.github?.id).toBeUndefined();
    });
  });
});
