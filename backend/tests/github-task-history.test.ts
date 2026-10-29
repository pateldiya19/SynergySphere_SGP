import crypto from 'crypto';

jest.mock('@/config', () => ({
  config: {
    GITHUB_WEBHOOK_SECRET: 'test-secret',
    GITHUB_WEBHOOK_URL: 'https://example.ngrok.dev/api/github/webhook',
    LOG_FILE: 'logs/test.log',
    LOG_LEVEL: 'error',
  },
}));

const project = { _id: { toString: () => 'project-1' } };
const task = {
  _id: { toString: () => 'task-1' },
  taskKey: 'TASK-42',
  title: 'TASK-42',
  status: 'todo',
  proofOfWork: [] as any[],
  save: jest.fn(),
};
const projectFindOne = jest.fn();
const taskFindOne = jest.fn();
const deliveryCreate = jest.fn();
const deliveryDeleteOne = jest.fn();
const historyRecord = jest.fn();

jest.mock('../src/app/models/index', () => ({
  Project: { findOne: projectFindOne, updateOne: jest.fn().mockResolvedValue({}) },
  Task: { findOne: taskFindOne },
  GitHubWebhookDelivery: { create: deliveryCreate, deleteOne: deliveryDeleteOne },
}));
jest.mock('../src/app/services/TaskHistoryService', () => ({
  TaskHistoryService: { record: historyRecord },
}));
jest.mock('@/utils', () => ({
  logger: { info: jest.fn() },
  ResponseUtils: {
    success: (res: any, data?: unknown, message?: string) =>
      res.status(200).json({ success: true, data, message }),
    error: (res: any, error: string, statusCode = 400) =>
      res.status(statusCode).json({ success: false, error }),
    unauthorized: (res: any, error: string) => res.status(401).json({ success: false, error }),
    serverError: (res: any, error: string) => res.status(500).json({ success: false, error }),
  },
}));

import {
  GitHubController,
  findTaskKey,
  findTaskKeys,
} from '../src/app/controllers/GitHubController';

function response() {
  const result: any = {};
  result.status = jest.fn().mockReturnValue(result);
  result.json = jest.fn().mockReturnValue(result);
  return result;
}

function request(
  payload: any,
  event = 'push',
  deliveryId = 'delivery-1',
  secret = 'test-secret'
): any {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return {
    body: payload,
    rawBody,
    headers: {
      'x-github-event': event,
      'x-github-delivery': deliveryId,
      'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`,
    },
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
    is() {
      return false;
    },
  };
}

describe('GitHub task history integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    task.taskKey = 'TASK-42';
    task.title = 'TASK-42';
    task.status = 'todo';
    task.proofOfWork.length = 0;
    projectFindOne.mockResolvedValue(project);
    taskFindOne.mockResolvedValue(task);
    deliveryCreate.mockResolvedValue({});
    deliveryDeleteOne.mockResolvedValue({});
    task.save.mockResolvedValue(task);
  });

  it.each([
    ['TASK-42 Implement work', 'TASK-42'],
    ['[TASK-42] Implement work', 'TASK-42'],
    ['feat(TASK-42): implement work', 'TASK-42'],
  ])('extracts %s', (message, expected) => {
    expect(findTaskKey(message)).toBe(expected);
  });

  it('extracts multiple exact task references without partial matches', () => {
    expect(findTaskKeys('TASK-123 TASK-42 TASK-1234')).toEqual([
      'TASK-123',
      'TASK-42',
      'TASK-1234',
    ]);
    expect(findTaskKeys('TASK-1234')).not.toContain('TASK-123');
  });

  it('rejects an invalid signature before processing', async () => {
    const res = response();
    await GitHubController.webhook(
      request(
        { repository: { owner: { login: 'org' }, name: 'repo' } },
        'push',
        'delivery-1',
        'wrong'
      ),
      res
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(deliveryCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing signature and missing delivery ID', async () => {
    const missingSignature = request({ repository: { owner: { login: 'org' }, name: 'repo' } });
    delete missingSignature.headers['x-hub-signature-256'];
    const signatureResponse = response();
    await GitHubController.webhook(missingSignature, signatureResponse);
    expect(signatureResponse.status).toHaveBeenCalledWith(401);

    const missingDelivery = request({ repository: { owner: { login: 'org' }, name: 'repo' } });
    delete missingDelivery.headers['x-github-delivery'];
    const deliveryResponse = response();
    await GitHubController.webhook(missingDelivery, deliveryResponse);
    expect(deliveryResponse.status).toHaveBeenCalledWith(400);
    expect(deliveryCreate).not.toHaveBeenCalled();
  });

  it('exposes only the configured public webhook URL', () => {
    const res = response();
    GitHubController.webhookConfig({} as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { url: 'https://example.ngrok.dev/api/github/webhook' },
      message: undefined,
    });
  });

  it('records each matching commit from a validated push', async () => {
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        ref: 'refs/heads/feature/TASK-42-work',
        commits: [
          { id: 'sha-1', message: 'TASK-42 first', author: { name: 'Dev' } },
          { id: 'sha-2', message: '[TASK-42] second', author: { name: 'Dev' } },
        ],
      }),
      res
    );
    expect(historyRecord).toHaveBeenCalledTimes(2);
    expect(historyRecord.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'GIT_COMMIT', source: 'github' })
    );
    expect(task.proofOfWork).toHaveLength(1);
    expect(task.proofOfWork[0]).toMatchObject({
      type: 'github',
      branch: 'feature/TASK-42-work',
      commitCount: 2,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adds commits to matching PR evidence and keeps distinct task keys separate', async () => {
    const otherTask = {
      ...task,
      _id: { toString: () => 'task-2' },
      taskKey: 'TASK-43',
      title: 'TASK-43',
      proofOfWork: [] as any[],
    };
    taskFindOne.mockImplementation(async (query: any) => {
      const key = query.taskKey || query.$or?.find((condition: any) => condition.taskKey)?.taskKey;
      return key === 'TASK-42' ? task : otherTask;
    });
    const prResponse = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 30,
            title: 'TASK-42 work',
            body: '',
            merged: false,
            state: 'open',
            html_url: 'https://github.com/org/repo/pull/30',
            user: { login: 'dev' },
            head: { ref: 'feature/TASK-42-work' },
            commits: 2,
          },
          action: 'opened',
        },
        'pull_request',
        'delivery-pr-link'
      ),
      prResponse
    );
    const pushResponse = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        ref: 'refs/heads/feature/TASK-42-work',
        commits: [{ id: 'sha-linked', message: 'TASK-42 work' }],
      }),
      pushResponse
    );

    expect(task.proofOfWork).toHaveLength(1);
    expect(task.proofOfWork[0]).toMatchObject({
      pullRequestNumber: 30,
      branch: 'feature/TASK-42-work',
      commitCount: 2,
      commits: [{ sha: 'sha-linked' }],
    });
    expect(otherTask.proofOfWork).toHaveLength(0);
    expect(taskFindOne).toHaveBeenCalledWith({ projectId: project._id, taskKey: 'TASK-42' });
  });

  it('keeps multiple pull requests linked to one task as separate evidence records', async () => {
    for (const [number, branch] of [
      [31, 'feature/TASK-42-first'],
      [32, 'feature/TASK-42-second'],
    ] as const) {
      await GitHubController.webhook(
        request(
          {
            repository: { owner: { login: 'org' }, name: 'repo' },
            pull_request: {
              number,
              title: `TASK-42 work ${number}`,
              body: '',
              merged: false,
              state: 'open',
              html_url: `https://github.com/org/repo/pull/${number}`,
              user: { login: 'dev' },
              head: { ref: branch },
            },
            action: 'opened',
          },
          'pull_request',
          `delivery-pr-${number}`
        ),
        response()
      );
    }

    expect(task.proofOfWork).toHaveLength(2);
    expect(task.proofOfWork.map((proof: any) => proof.pullRequestNumber)).toEqual([31, 32]);
  });

  it('matches task references in push branch names', async () => {
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        ref: 'refs/heads/feature/TASK-42-work',
        commits: [{ id: 'sha-branch', message: 'implement work' }],
      }),
      res
    );
    expect(taskFindOne).toHaveBeenCalledWith({ projectId: project._id, taskKey: 'TASK-42' });
  });

  it('does not create history when the referenced task is unknown', async () => {
    taskFindOne.mockResolvedValue(null);
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        commits: [{ id: 'sha-1', message: 'TASK-999 unknown' }],
      }),
      res
    );
    expect(historyRecord).not.toHaveBeenCalled();
  });

  it('does not link unrelated GitHub activity without a task reference', async () => {
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        ref: 'refs/heads/main',
        commits: [
          { id: 'sha-unrelated', message: 'Update dependency versions', author: { name: 'Dev' } },
        ],
      }),
      res
    );
    expect(taskFindOne).not.toHaveBeenCalled();
    expect(task.proofOfWork).toHaveLength(0);
    expect(historyRecord).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not process a duplicate delivery', async () => {
    deliveryCreate.mockRejectedValue({ code: 11000 });
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        commits: [{ id: 'sha-1', message: 'TASK-42 work' }],
      }),
      res
    );
    expect(historyRecord).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not create activity for an unconnected repository', async () => {
    projectFindOne.mockResolvedValue(null);
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'other-org' }, name: 'other-repo' },
        commits: [{ id: 'sha-foreign', message: 'TASK-42 work' }],
      }),
      res
    );
    expect(historyRecord).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('records merged pull requests as merged evidence', async () => {
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 18,
            title: 'TASK-42 auth',
            body: '',
            merged: true,
            state: 'closed',
            html_url: 'https://github.com/org/repo/pull/18',
            user: { login: 'dev' },
          },
          action: 'closed',
        },
        'pull_request',
        'delivery-pr'
      ),
      res
    );
    expect(historyRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PULL_REQUEST_MERGED', source: 'github' })
    );
  });

  it('records closed but unmerged pull requests as closed evidence', async () => {
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 19,
            title: 'TASK-42 auth',
            body: '',
            merged: false,
            state: 'closed',
            html_url: 'https://github.com/org/repo/pull/19',
            user: { login: 'dev' },
          },
          action: 'closed',
        },
        'pull_request',
        'delivery-pr-closed'
      ),
      res
    );
    expect(historyRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PULL_REQUEST_CLOSED', source: 'github' })
    );
  });

  it.each([
    ['title', { title: 'TASK-42 title reference', body: '', head: { ref: 'feature/work' } }],
    [
      'body',
      { title: 'Implement work', body: 'Related to TASK-42', head: { ref: 'feature/work' } },
    ],
    ['branch', { title: 'Implement work', body: '', head: { ref: 'feature/TASK-42-work' } }],
  ])('matches pull-request task references in the %s', async (_location, pullRequest) => {
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 18,
            ...pullRequest,
            merged: false,
            state: 'open',
            html_url: 'https://github.com/org/repo/pull/18',
            user: { login: 'dev' },
          },
          action: 'opened',
        },
        'pull_request',
        `delivery-pr-${_location}`
      ),
      res
    );
    expect(historyRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PULL_REQUEST_CREATED', source: 'github' })
    );
  });

  it('moves a todo task to in_progress when a matching PR opens', async () => {
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 20,
            title: 'TASK-42 work',
            body: '',
            merged: false,
            state: 'open',
            html_url: 'https://github.com/org/repo/pull/20',
            user: { login: 'dev' },
          },
          action: 'opened',
        },
        'pull_request',
        'delivery-pr-opened'
      ),
      res
    );
    expect(task.status).toBe('in_progress');
    expect(task.save).toHaveBeenCalled();
    expect(historyRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STATUS_CHANGED',
        source: 'github',
        changes: { status: { before: 'todo', after: 'in_progress' } },
      })
    );
  });

  it('matches a legacy task title when its generated task key differs', async () => {
    task.taskKey = 'TASK-1';
    task.title = 'TASK-42';
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 23,
            title: 'TASK-42 work',
            body: '',
            merged: false,
            state: 'open',
            html_url: 'https://github.com/org/repo/pull/23',
            user: { login: 'dev' },
          },
          action: 'opened',
        },
        'pull_request',
        'delivery-pr-legacy-title'
      ),
      res
    );
    expect(task.status).toBe('in_progress');
    expect(task.save).toHaveBeenCalled();
  });

  it('records a merged PR as proof without completing the task', async () => {
    task.status = 'in_progress';
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 21,
            title: 'TASK-42 work',
            body: '',
            merged: true,
            state: 'closed',
            html_url: 'https://github.com/org/repo/pull/21',
            user: { login: 'dev' },
            head: { ref: 'feature/TASK-42-work' },
            commits: 2,
            changed_files: 3,
            additions: 10,
            deletions: 4,
          },
          action: 'closed',
        },
        'pull_request',
        'delivery-pr-merged'
      ),
      res
    );
    expect(task.status).toBe('in_progress');
    expect(task.proofOfWork[0]).toMatchObject({
      type: 'github',
      pullRequestNumber: 21,
      pullRequestAuthor: 'dev',
      branch: 'feature/TASK-42-work',
      commitCount: 2,
      filesChanged: 3,
      additions: 10,
      deletions: 4,
      merged: true,
    });
    expect(historyRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PULL_REQUEST_MERGED', source: 'github' })
    );
    expect(historyRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STATUS_CHANGED',
        source: 'github',
        changes: { status: { after: 'done' } },
      })
    );
  });

  it('does not complete a task when a matching PR closes without merging', async () => {
    task.status = 'in_progress';
    const res = response();
    await GitHubController.webhook(
      request(
        {
          repository: { owner: { login: 'org' }, name: 'repo' },
          pull_request: {
            number: 22,
            title: 'TASK-42 work',
            body: '',
            merged: false,
            state: 'closed',
            html_url: 'https://github.com/org/repo/pull/22',
            user: { login: 'dev' },
          },
          action: 'closed',
        },
        'pull_request',
        'delivery-pr-unmerged'
      ),
      res
    );
    expect(task.status).toBe('in_progress');
    expect(historyRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STATUS_CHANGED', source: 'github' })
    );
  });

  it('scopes task lookup to the matched project', async () => {
    const res = response();
    await GitHubController.webhook(
      request({
        repository: { owner: { login: 'org' }, name: 'repo' },
        commits: [{ id: 'sha-1', message: 'TASK-42 work' }],
      }),
      res
    );
    expect(taskFindOne).toHaveBeenCalledWith({ projectId: project._id, taskKey: 'TASK-42' });
  });
});
