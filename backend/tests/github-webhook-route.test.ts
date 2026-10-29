import crypto from 'crypto';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { Project, Task, User } from '../src/app/models';

describe('GitHub webhook route with GitHub-shaped payloads', () => {
  let app: Express;
  let projectId: string;
  let taskId: string;
  const secret = 'realistic-route-test-secret';

  beforeAll(() => {
    config.GITHUB_WEBHOOK_SECRET = secret;
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});

    const owner = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Webhook Owner',
        email: 'webhook-owner@example.com',
        password: 'password123',
      })
      .expect(201);
    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${owner.body.data.accessToken}`)
      .send({ name: 'Webhook project', github: { owner: 'Acme', name: 'Widget' } })
      .expect(201);
    projectId = project.body.data.id;
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${owner.body.data.accessToken}`)
      .send({ projectId, title: 'Implement webhook handling' })
      .expect(201);
    taskId = task.body.data.id;
  });

  function pullRequestPayload(action: 'opened' | 'closed', merged: boolean) {
    return {
      action,
      number: 104,
      pull_request: {
        url: 'https://api.github.com/repos/acme/widget/pulls/104',
        id: 100104,
        number: 104,
        state: action === 'opened' ? 'open' : 'closed',
        title: 'TASK-1 Implement webhook handling',
        body: 'Closes task TASK-1',
        user: { login: 'contributor', id: 501 },
        html_url: 'https://github.com/acme/widget/pull/104',
        merged,
        commits: 3,
        changed_files: 4,
        additions: 28,
        deletions: 2,
        head: {
          label: 'contributor:feature/TASK-1-webhook',
          ref: 'feature/TASK-1-webhook',
          sha: 'a'.repeat(40),
          repo: {
            id: 8675309,
            name: 'widget',
            full_name: 'contributor/widget',
            owner: { login: 'contributor' },
          },
        },
        base: {
          label: 'acme:main',
          ref: 'main',
          sha: 'b'.repeat(40),
          repo: { id: 8675309, name: 'widget', full_name: 'acme/widget', owner: { login: 'acme' } },
        },
      },
      repository: {
        id: 8675309,
        name: 'widget',
        full_name: 'acme/widget',
        owner: { login: 'acme', id: 400 },
        private: false,
        html_url: 'https://github.com/acme/widget',
      },
      sender: { login: 'contributor', id: 501 },
    };
  }

  function sendGitHubDelivery(payload: unknown, deliveryId: string) {
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return request(app)
      .post('/api/github/webhook')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-Hub-Signature-256', signature)
      .send(rawBody);
  }

  function sendGitHubFormDelivery(payload: unknown, deliveryId: string) {
    const rawBody = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return request(app)
      .post('/api/github/webhook')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-Hub-Signature-256', signature)
      .send(rawBody);
  }

  it('routes opened and merged deliveries through signature, repository, task matching, and database save', async () => {
    const opened = await sendGitHubDelivery(
      pullRequestPayload('opened', false),
      'realistic-pr-opened'
    ).expect(200);
    expect(opened.body.message).toBe('GitHub webhook processed');
    expect((await Task.findById(taskId))?.status).toBe('in_progress');

    await sendGitHubDelivery(pullRequestPayload('closed', true), 'realistic-pr-merged').expect(200);
    const task = await Task.findById(taskId).lean();
    expect(task?.status).toBe('in_progress');
    expect(task?.proofOfWork?.[0]).toMatchObject({
      type: 'github',
      pullRequestNumber: 104,
      pullRequestTitle: 'TASK-1 Implement webhook handling',
      pullRequestAuthor: 'contributor',
      branch: 'feature/TASK-1-webhook',
      commitCount: 3,
      filesChanged: 4,
      additions: 28,
      deletions: 2,
      merged: true,
    });
  });

  it('accepts GitHub form-encoded payloads for both opened and merged pull requests', async () => {
    await sendGitHubFormDelivery(pullRequestPayload('opened', false), 'form-pr-opened').expect(200);
    expect((await Task.findById(taskId))?.status).toBe('in_progress');

    await sendGitHubFormDelivery(pullRequestPayload('closed', true), 'form-pr-merged').expect(200);
    const task = await Task.findById(taskId).lean();
    expect(task?.status).toBe('in_progress');
    expect(task?.proofOfWork?.[0].merged).toBe(true);
  });
});
