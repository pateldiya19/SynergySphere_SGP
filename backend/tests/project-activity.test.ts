import request from 'supertest';
import { Express } from 'express';
import { Project, Reply, Task, TaskHistory, Thread, User } from '../src/app/models';
import { createApp } from '../src/app';

describe('Project activity timeline', () => {
  let app: Express;
  let ownerToken: string;
  let memberToken: string;
  let ownerId: string;
  let projectId: string;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await TaskHistory.deleteMany({});
    await Thread.deleteMany({});
    await Reply.deleteMany({});

    const registration = await request(app).post('/api/auth/register').send({
      name: 'Timeline Owner',
      email: 'timeline-owner@example.com',
      password: 'password123',
    });
    ownerToken = registration.body.data.accessToken;
    ownerId = registration.body.data.user.id || registration.body.data.user._id;
    const project = await Project.create({
      name: 'Timeline Project',
      ownerId,
      members: [{ userId: ownerId, role: 'owner' }],
    });
    projectId = String(project._id);
  });

  it('aggregates task, GitHub, and discussion activity with actor/task data', async () => {
    const task = await Task.create({ projectId, taskKey: 'TASK-7', title: 'Timeline task' });
    await TaskHistory.create({
      taskId: task._id,
      projectId,
      actorId: ownerId,
      type: 'TASK_CREATED',
      source: 'user',
      description: 'Task created',
    });
    await TaskHistory.create({
      taskId: task._id,
      projectId,
      type: 'GIT_COMMIT',
      source: 'github',
      description: 'Git commit detected',
      metadata: { sha: 'abc123', url: 'https://github.com/example/repo/commit/abc123' },
    });
    const thread = await Thread.create({
      projectId,
      title: 'Question',
      authorId: ownerId,
      replyCount: 1,
      lastReplyAt: new Date(),
    });
    await Reply.create({ threadId: thread._id, authorId: ownerId, body: 'A reply' });

    const response = await request(app)
      .get(`/api/projects/${projectId}/activity?limit=20`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.data.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        'PROJECT_CREATED',
        'TASK_CREATED',
        'GIT_COMMIT',
        'DISCUSSION_THREAD_CREATED',
        'DISCUSSION_REPLY_CREATED',
      ])
    );
    const taskEvent = response.body.data.find((event: any) => event.eventType === 'TASK_CREATED');
    expect(taskEvent.task.taskKey).toBe('TASK-7');
    expect(taskEvent.actor.name).toBe('Timeline Owner');
  });

  it('enforces project authorization and paginates merged activity', async () => {
    const task = await Task.create({ projectId, taskKey: 'TASK-8', title: 'Pagination task' });
    for (let index = 0; index < 3; index += 1) {
      await TaskHistory.create({
        taskId: task._id,
        projectId,
        type: 'TASK_UPDATED',
        source: 'user',
        description: `Update ${index}`,
      });
    }

    const paged = await request(app)
      .get(`/api/projects/${projectId}/activity?page=1&limit=2`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.pagination).toEqual(
      expect.objectContaining({ page: 1, limit: 2, total: 4, pages: 2 })
    );

    const outsiderRegistration = await request(app).post('/api/auth/register').send({
      name: 'Timeline Outsider',
      email: 'timeline-outsider@example.com',
      password: 'password123',
    });
    await request(app)
      .get(`/api/projects/${projectId}/activity`)
      .set('Authorization', `Bearer ${outsiderRegistration.body.data.accessToken}`)
      .expect(404);
  });

  it('records task and member mutations in the project activity feed', async () => {
    const memberRegistration = await request(app).post('/api/auth/register').send({
      name: 'Timeline Member',
      email: 'timeline-member@example.com',
      password: 'password123',
    });
    memberToken = memberRegistration.body.data.accessToken;
    const memberId = memberRegistration.body.data.user.id || memberRegistration.body.data.user._id;

    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(200);

    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Audited task', assigneeId: memberId })
      .expect(201);
    const taskId = task.body.data.id || task.body.data._id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ priority: 'high' })
      .expect(200);
    await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'in_progress' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ type: 'developer_notes', notes: 'Completed project activity test work.' })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${taskId}/proofs/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' })
      .expect(200);
    await request(app)
      .delete(`/api/projects/${projectId}/members/${memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const response = await request(app)
      .get(`/api/projects/${projectId}/activity?limit=50`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(response.body.data.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        'MEMBER_ADDED',
        'TASK_CREATED',
        'TASK_ASSIGNED',
        'PRIORITY_CHANGED',
        'STATUS_CHANGED',
        'TASK_COMPLETED',
        'MEMBER_REMOVED',
      ])
    );
  });

  it('returns authorized project analytics without exposing another project', async () => {
    const completedTask = await Task.create({
      projectId,
      taskKey: 'TASK-10',
      title: 'Completed task',
      status: 'done',
      priority: 'high',
      assigneeId: ownerId,
    });
    await Task.create({
      projectId,
      taskKey: 'TASK-11',
      title: 'Blocked task',
      status: 'blocked',
      priority: 'urgent',
      dueDate: new Date('2020-01-01'),
      assigneeId: ownerId,
    });
    await Task.create({
      projectId,
      taskKey: 'TASK-12',
      title: 'Todo task',
      status: 'todo',
      priority: 'low',
    });
    await TaskHistory.create({
      taskId: completedTask._id,
      projectId,
      actorId: ownerId,
      type: 'TASK_COMPLETED',
      source: 'user',
      description: 'Task completed',
    });

    const response = await request(app)
      .get(`/api/projects/${projectId}/analytics`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        totalTasks: 3,
        completedTasks: 1,
        blockedTasks: 1,
        todoTasks: 1,
        overdueTasks: 1,
        completionPercentage: 33,
      })
    );
    expect(response.body.data.tasksByPriority).toEqual(
      expect.arrayContaining([
        { priority: 'urgent', count: 1 },
        { priority: 'high', count: 1 },
        { priority: 'low', count: 1 },
      ])
    );
    expect(response.body.data.completionOverTime).toHaveLength(1);
    expect(response.body.data.memberWorkload[0].assignedTasks).toBe(2);

    const outsider = await request(app).post('/api/auth/register').send({
      name: 'Analytics Outsider',
      email: 'analytics-outsider@example.com',
      password: 'password123',
    });
    await request(app)
      .get(`/api/projects/${projectId}/analytics`)
      .set('Authorization', `Bearer ${outsider.body.data.accessToken}`)
      .expect(404);
  });
});
