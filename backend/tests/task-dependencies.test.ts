import request from 'supertest';
import { Express } from 'express';
import { Project, Task, TaskHistory, User } from '../src/app/models';
import { createApp } from '../src/app';

describe('Task dependencies', () => {
  let app: Express;
  let ownerToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let memberId: string;
  let projectId: string;
  let otherProjectId: string;
  let firstTaskId: string;
  let secondTaskId: string;
  let otherProjectTaskId: string;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await TaskHistory.deleteMany({});

    const owner = await request(app).post('/api/auth/register').send({
      name: 'Dependency Owner',
      email: 'dependency-owner@example.com',
      password: 'password123',
    });
    ownerToken = owner.body.data.accessToken;
    const member = await request(app).post('/api/auth/register').send({
      name: 'Dependency Member',
      email: 'dependency-member@example.com',
      password: 'password123',
    });
    memberToken = member.body.data.accessToken;
    const outsider = await request(app).post('/api/auth/register').send({
      name: 'Dependency Outsider',
      email: 'dependency-outsider@example.com',
      password: 'password123',
    });
    outsiderToken = outsider.body.data.accessToken;

    memberId = member.body.data.user.id || member.body.data.user._id;
    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Dependency Project' })
      .expect(201);
    projectId = project.body.data.id;
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(200);
    const otherProject = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Other Project' })
      .expect(201);
    otherProjectId = otherProject.body.data.id;

    const first = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'First dependency task' })
      .expect(201);
    firstTaskId = first.body.data.id;
    const second = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Second dependency task' })
      .expect(201);
    secondTaskId = second.body.data.id;
    const other = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId: otherProjectId, title: 'Other project task' })
      .expect(201);
    otherProjectTaskId = other.body.data.id;
  });

  it('enforces same-project, unique, self, and circular dependency rules', async () => {
    await request(app)
      .post(`/api/tasks/${firstTaskId}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dependencyTaskId: secondTaskId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${firstTaskId}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dependencyTaskId: secondTaskId })
      .expect(409);
    await request(app)
      .post(`/api/tasks/${firstTaskId}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dependencyTaskId: firstTaskId })
      .expect(400);
    await request(app)
      .post(`/api/tasks/${firstTaskId}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dependencyTaskId: otherProjectTaskId })
      .expect(400);
    await request(app)
      .post(`/api/tasks/${secondTaskId}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dependencyTaskId: firstTaskId })
      .expect(400);

    await request(app)
      .post(`/api/tasks/${firstTaskId}/dependencies`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ dependencyTaskId: secondTaskId })
      .expect(403);

    const task = await request(app)
      .get(`/api/tasks/${firstTaskId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(task.body.data.dependencies[0].id).toBe(secondTaskId);
  });

  it('blocks completion until dependencies are complete and supports removal', async () => {
    await request(app)
      .post(`/api/tasks/${firstTaskId}/dependencies`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dependencyTaskId: secondTaskId })
      .expect(200);
    for (const taskId of [firstTaskId, secondTaskId]) {
      await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ assigneeId: memberId })
        .expect(200);
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ status: 'in_progress' })
        .expect(200);
    }
    await request(app)
      .post(`/api/tasks/${firstTaskId}/proofs`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ type: 'developer_notes', notes: 'First task complete' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${firstTaskId}/proofs/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' })
      .expect(400);

    await request(app)
      .post(`/api/tasks/${secondTaskId}/proofs`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ type: 'developer_notes', notes: 'Prerequisite complete' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${secondTaskId}/proofs/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${firstTaskId}/proofs/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' })
      .expect(200);
    await request(app)
      .delete(`/api/tasks/${firstTaskId}/dependencies/${secondTaskId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const task = await request(app)
      .get(`/api/tasks/${firstTaskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(task.body.data.dependencies || []).toHaveLength(0);
  });
});
