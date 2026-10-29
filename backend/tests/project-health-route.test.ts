import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Project, Task, User } from '../src/app/models';

describe('GET /api/projects/:id/health', () => {
  let app: Express;
  let ownerToken: string;
  let outsiderToken: string;
  let ownerId: string;
  let projectId: string;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});

    const owner = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Health Owner',
        email: 'health-owner@example.com',
        password: 'password123',
      })
      .expect(201);
    ownerToken = owner.body.data.accessToken;
    ownerId = owner.body.data.user.id || owner.body.data.user._id;
    const outsider = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Health Outsider',
        email: 'health-outsider@example.com',
        password: 'password123',
      })
      .expect(201);
    outsiderToken = outsider.body.data.accessToken;
    const project = await Project.create({ name: 'Health Project', ownerId });
    projectId = String(project._id);
  });

  it('returns task-linked risk metrics to project members only', async () => {
    const dependency = await Task.create({ projectId, taskKey: 'TASK-1', title: 'Prerequisite' });
    const urgent = await Task.create({
      projectId,
      taskKey: 'TASK-2',
      title: 'Urgent deadline',
      priority: 'urgent',
      dueDate: new Date(Date.now() + 3 * 86400000),
    });
    const waiting = await Task.create({
      projectId,
      taskKey: 'TASK-3',
      title: 'Waiting task',
      assigneeId: ownerId,
      dependencies: [dependency._id],
    });

    const response = await request(app)
      .get(`/api/projects/${projectId}/health`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.data.status).toBe('At Risk');
    expect(response.body.data.metrics).toMatchObject({
      totalTasks: 3,
      urgentDueSoonTasks: 1,
      dependencyBlockedTasks: 1,
      unassignedTasks: 2,
    });
    expect(
      response.body.data.risks.find((risk: any) => risk.key === 'urgent_due_soon').tasks[0].id
    ).toBe(String(urgent._id));
    expect(
      response.body.data.risks.find((risk: any) => risk.key === 'dependencies').tasks[0].id
    ).toBe(String(waiting._id));

    await request(app)
      .get(`/api/projects/${projectId}/health`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
  });
});
