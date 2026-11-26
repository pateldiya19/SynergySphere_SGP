/**
 * Prove that two projects with two repositories stay separate.
 *
 *   npm run verify:multi-repo
 *
 * Creates two projects bound to different repositories, gives each a task,
 * then delivers signed webhooks for both. Every task key here is TASK-1 on
 * purpose: if routing were keyed on the task reference alone and ignored the
 * repository, the evidence would land on the wrong project and this would
 * catch it.
 *
 * Checks performed:
 *   - each task receives only its own repository's pull request
 *   - a commit for repo A never appears on repo B's task
 *   - a webhook for an unconnected repository is ignored
 *   - a task key that exists in both projects resolves per repository
 *
 * Cleans up the projects it creates. Read-only with respect to existing data.
 */
import crypto from 'crypto';
import Database from '@/config/database';
import { config } from '@/config';
import { Project, Task } from '@/models';

const BASE = process.env.DEMO_BASE_URL || `http://127.0.0.1:${config.PORT}`;
const PREFIX = 'Isolation Check';

type Json = Record<string, any>;

async function api(path: string, options: { method?: string; token?: string; body?: Json } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok || payload.success === false) {
    throw new Error(
      `${options.method || 'GET'} ${path} -> ${response.status} ${payload.error || ''}`
    );
  }
  return payload.data;
}

async function deliver(event: string, payload: Json, deliveryId: string) {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${crypto
    .createHmac('sha256', config.GITHUB_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex')}`;
  const response = await fetch(`${BASE}/api/github/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': event,
      'X-GitHub-Delivery': deliveryId,
      'X-Hub-Signature-256': signature,
    },
    body: raw,
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  return String(body.message || response.status);
}

function repoPayload(repo: { owner: string; name: string; id: number }) {
  return {
    id: repo.id,
    name: repo.name,
    owner: { login: repo.owner },
    full_name: `${repo.owner}/${repo.name}`,
  };
}

const results: Array<{ ok: boolean; label: string; detail?: string }> = [];

function check(label: string, ok: boolean, detail?: string) {
  results.push({ ok, label, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  if (!config.GITHUB_WEBHOOK_SECRET) {
    console.error('GITHUB_WEBHOOK_SECRET is not set; every delivery would be rejected.');
    process.exit(1);
  }

  const database = Database.getInstance();
  await database.connect();

  // Remove anything a previous run left behind.
  const stale = await Project.find({ name: { $regex: `^${PREFIX} ` } })
    .select('_id')
    .lean<Array<{ _id: unknown }>>();
  if (stale.length) {
    const ids = stale.map(project => project._id);
    await Task.deleteMany({ projectId: { $in: ids } });
    await Project.deleteMany({ _id: { $in: ids } });
  }

  const owner = await api('/api/auth/login', {
    method: 'POST',
    body: {
      email: process.env.DEMO_REVIEWER || 'aarav@synergysphere.dev',
      password: 'Password123',
    },
  });
  const token = owner.accessToken as string;

  const repoA = { owner: 'acme-labs', name: 'payments-api', id: 500001 };
  const repoB = { owner: 'globex', name: 'billing-web', id: 500002 };

  console.log('\nSetting up two projects with two repositories');
  const projectA = await api('/api/projects', {
    method: 'POST',
    token,
    body: {
      name: `${PREFIX} A`,
      github: { owner: repoA.owner, name: repoA.name },
    },
  });
  const projectB = await api('/api/projects', {
    method: 'POST',
    token,
    body: {
      name: `${PREFIX} B`,
      github: { owner: repoB.owner, name: repoB.name },
    },
  });
  console.log(`  A: ${projectA.github.owner}/${projectA.github.name}`);
  console.log(`  B: ${projectB.github.owner}/${projectB.github.name}`);

  const taskA = await api('/api/tasks', {
    method: 'POST',
    token,
    body: {
      projectId: projectA.id,
      title: 'Payments work',
      assigneeId: owner.user.id || owner.user._id,
    },
  });
  const taskB = await api('/api/tasks', {
    method: 'POST',
    token,
    body: {
      projectId: projectB.id,
      title: 'Billing work',
      assigneeId: owner.user.id || owner.user._id,
    },
  });
  console.log(`  task A key: ${taskA.taskKey} | task B key: ${taskB.taskKey}`);
  check(
    'both projects allocate the same task key independently',
    taskA.taskKey === taskB.taskKey,
    `${taskA.taskKey} vs ${taskB.taskKey}`
  );

  console.log('\nDelivering webhooks');
  const stamp = Date.now();

  await deliver(
    'pull_request',
    {
      action: 'opened',
      number: 11,
      pull_request: {
        number: 11,
        state: 'open',
        merged: false,
        title: `${taskA.taskKey} Payments change`,
        body: `Resolves ${taskA.taskKey}`,
        html_url: `https://github.com/${repoA.owner}/${repoA.name}/pull/11`,
        user: { login: 'dev-a', id: 900001 },
        head: { ref: `${taskA.taskKey}-payments` },
        additions: 10,
        deletions: 1,
        changed_files: 2,
        commits: 1,
      },
      repository: repoPayload(repoA),
    },
    `iso-a-pr-${stamp}`
  );

  await deliver(
    'pull_request',
    {
      action: 'opened',
      number: 22,
      pull_request: {
        number: 22,
        state: 'open',
        merged: false,
        title: `${taskB.taskKey} Billing change`,
        body: `Resolves ${taskB.taskKey}`,
        html_url: `https://github.com/${repoB.owner}/${repoB.name}/pull/22`,
        user: { login: 'dev-b', id: 900002 },
        head: { ref: `${taskB.taskKey}-billing` },
        additions: 20,
        deletions: 2,
        changed_files: 3,
        commits: 2,
      },
      repository: repoPayload(repoB),
    },
    `iso-b-pr-${stamp}`
  );

  await deliver(
    'push',
    {
      ref: `refs/heads/${taskA.taskKey}-payments`,
      repository: repoPayload(repoA),
      commits: [
        {
          id: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
          message: `${taskA.taskKey}: payments commit`,
          url: `https://github.com/${repoA.owner}/${repoA.name}/commit/aaaa1111`,
          author: { name: 'Dev A' },
        },
      ],
    },
    `iso-a-push-${stamp}`
  );

  const unconnected = await deliver(
    'pull_request',
    {
      action: 'opened',
      number: 99,
      pull_request: {
        number: 99,
        state: 'open',
        merged: false,
        title: `${taskA.taskKey} Should not land anywhere`,
        body: `Resolves ${taskA.taskKey}`,
        html_url: 'https://github.com/stranger/unknown-repo/pull/99',
        user: { login: 'stranger', id: 900003 },
        head: { ref: `${taskA.taskKey}-stranger` },
        commits: 1,
      },
      repository: { id: 999999, name: 'unknown-repo', owner: { login: 'stranger' } },
    },
    `iso-unconnected-${stamp}`
  );
  check(
    'a webhook for an unconnected repository is ignored',
    /not connected/i.test(unconnected),
    unconnected
  );

  console.log('\nInspecting stored evidence');
  const storedA = await Task.findById(taskA.id).lean<any>();
  const storedB = await Task.findById(taskB.id).lean<any>();
  const proofsA = (storedA?.proofOfWork || []).filter((p: any) => p.source === 'github');
  const proofsB = (storedB?.proofOfWork || []).filter((p: any) => p.source === 'github');

  const reposOnA = [...new Set(proofsA.map((p: any) => p.repository))];
  const reposOnB = [...new Set(proofsB.map((p: any) => p.repository))];
  console.log(
    `  A evidence: ${JSON.stringify(reposOnA)} PRs ${JSON.stringify(proofsA.map((p: any) => p.pullRequestNumber))}`
  );
  console.log(
    `  B evidence: ${JSON.stringify(reposOnB)} PRs ${JSON.stringify(proofsB.map((p: any) => p.pullRequestNumber))}`
  );

  check(
    'project A holds only repo A evidence',
    reposOnA.length === 1 && reposOnA[0] === `${repoA.owner}/${repoA.name}`,
    JSON.stringify(reposOnA)
  );
  check(
    'project B holds only repo B evidence',
    reposOnB.length === 1 && reposOnB[0] === `${repoB.owner}/${repoB.name}`,
    JSON.stringify(reposOnB)
  );
  check(
    'pull request numbers did not cross over',
    proofsA.every((p: any) => p.pullRequestNumber === 11) &&
      proofsB.every((p: any) => p.pullRequestNumber === 22)
  );

  const commitsA = proofsA.flatMap((p: any) => p.commits || []);
  const commitsB = proofsB.flatMap((p: any) => p.commits || []);
  check(
    'repo A commit landed on task A',
    commitsA.some((c: any) => String(c.sha).startsWith('aaaa1111'))
  );
  check(
    'repo A commit did not land on task B',
    !commitsB.some((c: any) => String(c.sha).startsWith('aaaa1111'))
  );
  check(
    'the stranger pull request landed nowhere',
    !proofsA.some((p: any) => p.pullRequestNumber === 99) &&
      !proofsB.some((p: any) => p.pullRequestNumber === 99)
  );

  console.log('\nCleaning up');
  await Task.deleteMany({ projectId: { $in: [projectA.id, projectB.id] } });
  await Project.deleteMany({ _id: { $in: [projectA.id, projectB.id] } });
  console.log('  removed both isolation-check projects');

  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  await database.disconnect();
  if (failed.length) process.exit(1);
}

void main().catch(error => {
  console.error('\nIsolation check failed:', error.message);
  process.exit(1);
});
