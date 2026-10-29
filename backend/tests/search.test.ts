import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Project, Task, User } from '../src/app/models';

describe('Global search', () => {
  let app: Express;
  let accessToken: string;
  let ownerId: string;

  beforeAll(async () => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});

    const ownerResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Search Owner', email: 'search-owner@example.com', password: 'password123' });
    accessToken = ownerResponse.body.data.accessToken;
    ownerId = ownerResponse.body.data.user.id || ownerResponse.body.data.user._id;
  });

  async function createProject(name: string, owner: string, isActive = true) {
    return Project.create({
      name,
      ownerId: owner,
      isActive,
      members: [{ userId: owner, role: 'owner' }],
    });
  }

  it('rejects empty queries and invalid types', async () => {
    await request(app)
      .get('/api/search?q=   ')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
    await request(app)
      .get('/api/search?q=test&type=unknown')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('searches active users only', async () => {
    await User.create([
      { name: 'Visible Search User', email: 'visible-search@example.com', password: 'password123' },
      {
        name: 'Inactive Search User',
        email: 'inactive-search@example.com',
        password: 'password123',
        isActive: false,
      },
    ]);

    const response = await request(app)
      .get('/api/search?q=Search%20User&type=users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.users).toHaveLength(1);
    expect(response.body.data.users[0].email).toBe('visible-search@example.com');
  });

  it('returns only active projects accessible to the authenticated user', async () => {
    await createProject('Visible Search Project', ownerId);
    const outsider = await User.create({
      name: 'Outsider',
      email: 'outsider@example.com',
      password: 'password123',
    });
    await createProject('Secret Search Project', (outsider._id as any).toString());
    await createProject('Archived Search Project', ownerId, false);

    const response = await request(app)
      .get('/api/search?q=Search%20Project&type=projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.projects.map((project: any) => project.name)).toEqual([
      'Visible Search Project',
    ]);
  });

  it('returns tasks only from accessible active projects', async () => {
    const visibleProject = await createProject('Visible Task Project', ownerId);
    const outsider = await User.create({
      name: 'Task Outsider',
      email: 'task-outsider@example.com',
      password: 'password123',
    });
    const secretProject = await createProject(
      'Secret Task Project',
      (outsider._id as any).toString()
    );
    await Task.create([
      {
        projectId: visibleProject._id,
        taskKey: 'TASK-1',
        title: 'Visible Search Task',
        description: 'Visible task',
      },
      {
        projectId: secretProject._id,
        taskKey: 'TASK-1',
        title: 'Secret Search Task',
        description: 'Secret task',
      },
    ]);

    const response = await request(app)
      .get('/api/search?q=Search%20Task&type=tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.tasks.map((task: any) => task.title)).toEqual([
      'Visible Search Task',
    ]);
  });

  it('returns per-group pagination metadata', async () => {
    await createProject('First Pagination Project', ownerId);
    await createProject('Second Pagination Project', ownerId);

    const response = await request(app)
      .get('/api/search?q=Pagination&type=projects&page=2&limit=1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.projects).toHaveLength(1);
    expect(response.body.pagination.projects).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
  });
});
