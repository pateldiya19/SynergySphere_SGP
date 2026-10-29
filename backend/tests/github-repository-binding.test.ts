import crypto from 'crypto';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { Project, Task, User } from '../src/app/models';
import { parseRepositoryInput } from '../src/core/utils/github';

describe('GitHub repository binding', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const SECRET = 'repository-binding-test-secret';

  beforeAll(() => {
    config.GITHUB_WEBHOOK_SECRET = SECRET;
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Repo Owner', email: 'repo-owner@example.com', password: 'password123' })
      .expect(201);
    token = owner.body.data.accessToken;
  });

  function createProject(github: Record<string, unknown>, name = 'Repo project') {
    return request(app).post('/api/projects').set(auth()).send({ name, github });
  }

  describe('accepting what people actually type', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['owner and name separately', { owner: 'Acme', name: 'Widget' }],
      ['a full https URL in the owner box', { owner: 'https://github.com/Acme/Widget', name: '' }],
      ['a URL with a .git suffix', { owner: 'https://github.com/Acme/Widget.git', name: '' }],
      ['an SSH clone string', { owner: 'git@github.com:Acme/Widget.git', name: '' }],
      ['shorthand owner/name', { owner: 'Acme/Widget', name: '' }],
      ['a URL pasted into the name box', { owner: '', name: 'https://github.com/Acme/Widget' }],
    ];

    it.each(cases)('normalises %s', async (_label, github) => {
      const response = await createProject(github, `Project ${_label}`).expect(201);
      expect(response.body.data.github).toMatchObject({ owner: 'acme', name: 'widget' });
    });

    it('rejects input that names no repository', async () => {
      const response = await createProject({ owner: 'just-an-owner', name: '' });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/owner and name|paste its GitHub URL/i);
    });
  });

  describe('one repository, one project', () => {
    it('refuses to bind a repository that another project already uses', async () => {
      await createProject({ owner: 'acme', name: 'widget' }, 'First project').expect(201);

      const second = await createProject({ owner: 'acme', name: 'widget' }, 'Second project');

      expect(second.status).toBe(409);
      expect(second.body.error).toMatch(/already connected to the project "First project"/);
    });

    it('still lets a project rebind its own repository', async () => {
      const created = await createProject({ owner: 'acme', name: 'widget' }).expect(201);

      await request(app)
        .put(`/api/projects/${created.body.data.id}`)
        .set(auth())
        .send({ github: { owner: 'acme', name: 'widget' } })
        .expect(200);
    });

    it('frees the repository once a project disconnects it', async () => {
      const first = await createProject({ owner: 'acme', name: 'widget' }, 'First').expect(201);
      await request(app)
        .put(`/api/projects/${first.body.data.id}`)
        .set(auth())
        .send({ github: null })
        .expect(200);

      await createProject({ owner: 'acme', name: 'widget' }, 'Second').expect(201);
    });
  });

  describe('webhook delivery status', () => {
    it('records when a delivery last matched the project', async () => {
      const created = await createProject({ owner: 'acme', name: 'widget' }).expect(201);
      const projectId = created.body.data.id;

      expect((await Project.findById(projectId).lean<any>()).github.lastDeliveryAt).toBeUndefined();

      const payload = {
        ref: 'refs/heads/main',
        repository: { id: 42, name: 'widget', owner: { login: 'acme' } },
        commits: [],
      };
      const raw = JSON.stringify(payload);
      await request(app)
        .post('/api/github/webhook')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'push')
        .set('X-GitHub-Delivery', 'delivery-status-1')
        .set(
          'X-Hub-Signature-256',
          `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`
        )
        .send(raw)
        .expect(200);

      const project = await Project.findById(projectId).lean<any>();
      expect(project.github.lastDeliveryAt).toBeInstanceOf(Date);
      expect(project.github.lastDeliveryEvent).toBe('push');
    });
  });
});

describe('parseRepositoryInput', () => {
  it.each([
    ['https://github.com/Owner/Repo', 'owner', 'repo'],
    ['https://www.github.com/Owner/Repo/', 'owner', 'repo'],
    ['https://github.com/Owner/Repo.git', 'owner', 'repo'],
    ['github.com/Owner/Repo', 'owner', 'repo'],
    ['git@github.com:Owner/Repo.git', 'owner', 'repo'],
    ['Owner/Repo', 'owner', 'repo'],
  ])('parses %s', (input, owner, name) => {
    expect(parseRepositoryInput(input, '')).toEqual({ owner, name });
  });

  it.each([
    ['', ''],
    ['just-a-word', ''],
    ['https://gitlab.com/owner/repo', ''],
  ])('returns null for %s', (ownerInput, nameInput) => {
    expect(parseRepositoryInput(ownerInput, nameInput)).toBeNull();
  });

  it('prefers a full reference over separate fields', () => {
    expect(parseRepositoryInput('https://github.com/real/repo', 'ignored')).toEqual({
      owner: 'real',
      name: 'repo',
    });
  });
});
