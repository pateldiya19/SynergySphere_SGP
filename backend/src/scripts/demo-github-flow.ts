/**
 * Drive the whole GitHub proof-of-work workflow against a running server.
 *
 *   npm run demo:github
 *
 * Sends correctly-signed webhook deliveries to the local /api/github/webhook
 * endpoint -- the same code path GitHub calls -- so the integration can be
 * exercised and rehearsed without a public tunnel or a real repository.
 *
 * It walks the full journey:
 *   1. bind a project to a repository
 *   2. push a commit mentioning the task key   -> commit evidence appears
 *   3. open a pull request mentioning the key  -> task moves to In Progress
 *   4. merge the pull request                  -> evidence marked merged
 *   5. the assignee submits proof              -> task is Ready for Review
 *   6. a reviewer approves                     -> task is Done
 *
 * Nothing here bypasses application logic: every step goes through the real
 * HTTP API with real signatures and real authentication.
 */
import crypto from 'crypto';
import Database from '@/config/database';
import { config } from '@/config';
import { Project, Task, User } from '@/models';

const BASE = process.env.DEMO_BASE_URL || `http://127.0.0.1:${config.PORT}`;
const REPO = { owner: 'synergysphere-demo', name: 'checkout-service' };

/** The GitHub account the demo pull requests are authored by. */
const PR_AUTHOR = { login: 'neha-dev', id: 77001 };

/** Projects this script creates are named with this prefix so reruns can tidy up. */
const DEMO_PROJECT_PREFIX = 'GitHub Demo';

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

/** Deliver a webhook exactly as GitHub would, signature and all. */
async function deliverWebhook(event: string, payload: Json, deliveryId: string) {
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
  return { status: response.status, message: body.message };
}

function repositoryPayload() {
  return {
    id: 912345678,
    name: REPO.name,
    owner: { login: REPO.owner },
    full_name: `${REPO.owner}/${REPO.name}`,
  };
}

function step(number: number, label: string) {
  console.log(`\n${number}. ${label}`);
}

async function login(email: string, password = 'Password123') {
  const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { token: data.accessToken as string, user: data.user };
}

/**
 * Remove projects left behind by earlier runs.
 *
 * Besides keeping the workspace tidy, this matters for correctness: the
 * webhook finds a project by repository, so two projects bound to the same
 * repository make the destination of an incoming commit ambiguous.
 */
async function clearPreviousRuns(): Promise<number> {
  const stale = await Project.find({ name: { $regex: `^${DEMO_PROJECT_PREFIX} ` } })
    .select('_id')
    .lean<Array<{ _id: unknown }>>();
  if (stale.length === 0) return 0;
  const ids = stale.map(project => project._id);
  await Task.deleteMany({ projectId: { $in: ids } });
  await Project.deleteMany({ _id: { $in: ids } });
  return stale.length;
}

/**
 * Give the developer the verified GitHub identity the demo pull requests are
 * authored by, so the walkthrough shows author verification actually passing
 * rather than sitting permanently indeterminate.
 *
 * DEMO SEEDING ONLY. In normal use this field is written exclusively by the
 * OAuth callback -- a user cannot assert their own GitHub identity through the
 * API, which is the entire point of it. Set DEMO_LINK_GITHUB=0 to skip this
 * and show the unlinked state instead.
 */
async function linkDeveloperIdentity(email: string): Promise<string | null> {
  if (process.env.DEMO_LINK_GITHUB === '0') return null;

  const existing = await User.findOne({ email }).select('github').lean<any>();
  if (existing?.github?.id) return existing.github.login;

  await User.updateOne(
    { email },
    { $set: { github: { ...PR_AUTHOR, linkedAt: new Date() } } },
    { timestamps: false }
  );
  return PR_AUTHOR.login;
}

async function main() {
  if (!config.GITHUB_WEBHOOK_SECRET) {
    console.error('GITHUB_WEBHOOK_SECRET is not set; the webhook would reject every delivery.');
    process.exit(1);
  }

  const reviewerEmail = process.env.DEMO_REVIEWER || 'aarav@synergysphere.dev';
  const developerEmail = process.env.DEMO_DEVELOPER || 'neha@synergysphere.dev';

  console.log(`Server:    ${BASE}`);
  console.log(`Reviewer:  ${reviewerEmail}`);
  console.log(`Developer: ${developerEmail}`);

  const database = Database.getInstance();
  await database.connect();

  const removed = await clearPreviousRuns();
  if (removed > 0) console.log(`\nCleared ${removed} project(s) from earlier runs.`);

  const linkedLogin = await linkDeveloperIdentity(developerEmail);
  console.log(
    linkedLogin
      ? `Linked (demo seeding): ${developerEmail} -> @${linkedLogin}`
      : 'GitHub identity not linked (DEMO_LINK_GITHUB=0)'
  );

  const reviewer = await login(reviewerEmail);
  const developer = await login(developerEmail);

  step(1, 'Create a project and bind it to a repository');
  const project = await api('/api/projects', {
    method: 'POST',
    token: reviewer.token,
    body: {
      name: `GitHub Demo ${new Date().toISOString().slice(11, 19)}`,
      description: 'End-to-end GitHub proof-of-work walkthrough.',
      // Pasted as a full URL on purpose: the binding must normalise it.
      github: { owner: `https://github.com/${REPO.owner}/${REPO.name}`, name: '' },
    },
  });
  console.log(`   project ${project.id}`);
  console.log(`   repository bound as ${project.github.owner}/${project.github.name}`);

  await api(`/api/projects/${project.id}/members`, {
    method: 'POST',
    token: reviewer.token,
    body: { userId: developer.user.id || developer.user._id, role: 'member' },
  });

  const task = await api('/api/tasks', {
    method: 'POST',
    token: reviewer.token,
    body: {
      projectId: project.id,
      title: 'Add idempotency keys to the payments endpoint',
      description: 'Prevent duplicate charges on retry.',
      assigneeId: developer.user.id || developer.user._id,
      requiresGitHubEvidence: true,
      priority: 'high',
    },
  });
  console.log(`   task ${task.taskKey} created, assigned to ${developerEmail}`);
  console.log(`   status: ${task.status}`);

  const branch = `${task.taskKey}-idempotency-keys`;

  step(2, `Push a commit mentioning ${task.taskKey}`);
  console.log(
    '   ' +
      JSON.stringify(
        await deliverWebhook(
          'push',
          {
            ref: `refs/heads/${branch}`,
            repository: repositoryPayload(),
            commits: [
              {
                id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
                message: `${task.taskKey}: add idempotency key column and lookup`,
                url: `https://github.com/${REPO.owner}/${REPO.name}/commit/a1b2c3d4`,
                author: { name: 'Neha Verma' },
              },
            ],
          },
          `demo-push-${Date.now()}`
        )
      )
  );

  step(3, `Open a pull request mentioning ${task.taskKey}`);
  const pullRequest = {
    number: 128,
    state: 'open',
    merged: false,
    title: `${task.taskKey} Add idempotency keys to payments`,
    body: `Resolves ${task.taskKey}.`,
    html_url: `https://github.com/${REPO.owner}/${REPO.name}/pull/128`,
    user: { login: 'neha-dev', id: 77001 },
    head: { ref: branch },
    additions: 184,
    deletions: 23,
    changed_files: 6,
    commits: 3,
  };
  console.log(
    '   ' +
      JSON.stringify(
        await deliverWebhook(
          'pull_request',
          {
            action: 'opened',
            number: 128,
            pull_request: pullRequest,
            repository: repositoryPayload(),
          },
          `demo-pr-open-${Date.now()}`
        )
      )
  );

  let current = await api(`/api/tasks/${task.id}`, { token: reviewer.token });
  console.log(`   task status after PR opened: ${current.status}  (automation moved it)`);

  step(4, 'Merge the pull request');
  console.log(
    '   ' +
      JSON.stringify(
        await deliverWebhook(
          'pull_request',
          {
            action: 'closed',
            number: 128,
            pull_request: { ...pullRequest, state: 'closed', merged: true },
            repository: repositoryPayload(),
          },
          `demo-pr-merge-${Date.now()}`
        )
      )
  );

  current = await api(`/api/tasks/${task.id}`, { token: reviewer.token });
  const evidence = (current.proofOfWork || []).find((p: any) => p.source === 'github');
  console.log('   GitHub evidence recorded:');
  console.log(`     repository  ${evidence?.repository}`);
  console.log(`     branch      ${evidence?.branch}`);
  console.log(
    `     pull request #${evidence?.pullRequestNumber} by @${evidence?.pullRequestAuthor}`
  );
  console.log(`     state       ${evidence?.state} (merged: ${evidence?.merged})`);
  console.log(`     commits     ${evidence?.commitCount}`);
  console.log(
    `     diff        +${evidence?.additions} / -${evidence?.deletions} across ${evidence?.filesChanged} files`
  );
  console.log(
    `     author matches assignee: ${evidence?.authorMatchesAssignee ?? 'indeterminate (developer has not linked GitHub)'}`
  );

  step(5, 'Developer submits the evidence for review');
  current = await api(`/api/tasks/${task.id}/proofs`, {
    method: 'POST',
    token: developer.token,
    body: { type: 'github' },
  });
  console.log(`   task status: ${current.status}`);

  step(6, 'Reviewer approves');
  try {
    await api(`/api/tasks/${task.id}/proofs/review`, {
      method: 'POST',
      token: developer.token,
      body: { decision: 'approved' },
    });
    console.log('   WARNING: the developer approved their own work (should not happen)');
  } catch {
    console.log('   self-approval correctly refused');
  }

  current = await api(`/api/tasks/${task.id}/proofs/review`, {
    method: 'POST',
    token: reviewer.token,
    body: { decision: 'approved', comment: 'Verified against the merged PR.' },
  });
  console.log(`   task status: ${current.status}`);

  console.log('\nWalkthrough complete.');
  console.log(`Open the task at: ${config.FRONTEND_URL}/tasks/${task.id}`);

  await database.disconnect();
}

void main().catch(error => {
  console.error('\nWalkthrough failed:', error.message);
  process.exit(1);
});
