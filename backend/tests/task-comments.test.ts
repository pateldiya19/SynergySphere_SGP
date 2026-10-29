import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Notification, Project, Task, TaskComment, User } from '../src/app/models';

describe('Task comments', () => {
  let app: Express;
  let ownerToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let memberId: string;
  let projectId: string;
  let taskId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await TaskComment.deleteMany({});
    await Notification.deleteMany({});

    const register = async (name: string, email: string) =>
      request(app)
        .post('/api/auth/register')
        .send({ name, email, password: 'password123' })
        .expect(201);

    const owner = await register('Comment Owner', 'comment-owner@example.com');
    const member = await register('Comment Member', 'comment-member@example.com');
    const outsider = await register('Comment Outsider', 'comment-outsider@example.com');
    ownerToken = owner.body.data.accessToken;
    memberToken = member.body.data.accessToken;
    outsiderToken = outsider.body.data.accessToken;
    memberId = String(member.body.data.user.id || member.body.data.user._id);

    const project = await request(app)
      .post('/api/projects')
      .set(auth(ownerToken))
      .send({ name: 'Comment project' })
      .expect(201);
    projectId = project.body.data.id;

    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(ownerToken))
      .send({ userId: memberId, role: 'member' });

    const task = await request(app)
      .post('/api/tasks')
      .set(auth(ownerToken))
      .send({ projectId, title: 'Document the API', assigneeId: memberId })
      .expect(201);
    taskId = task.body.data.id;
  });

  it('adds a comment and returns it with its author', async () => {
    const response = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'Started on the endpoint reference.' })
      .expect(201);

    expect(response.body.data.body).toBe('Started on the endpoint reference.');
    expect(response.body.data.authorId.name).toBe('Comment Member');
  });

  it('lists comments oldest first', async () => {
    for (const body of ['First', 'Second', 'Third']) {
      await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set(auth(ownerToken))
        .send({ body })
        .expect(201);
    }

    const response = await request(app)
      .get(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .expect(200);

    expect(response.body.data.map((comment: any) => comment.body)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('notifies the assignee and project owner, but not the author', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(ownerToken))
      .send({ body: 'Any progress here?' })
      .expect(201);

    const notifications = await Notification.find({ type: 'task_comment' }).lean();
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0].userId)).toBe(memberId);
    expect(notifications[0].message).toContain('Document the API');
    expect(String(notifications[0].payload.taskId)).toBe(taskId);
  });

  it('rejects an empty or oversized comment', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: '   ' })
      .expect(422);

    await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'x'.repeat(2001) })
      .expect(422);
  });

  it('hides comments from someone outside the project', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'Internal note.' })
      .expect(201);

    await request(app).get(`/api/tasks/${taskId}/comments`).set(auth(outsiderToken)).expect(404);
    await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(outsiderToken))
      .send({ body: 'Let me in.' })
      .expect(404);
  });

  it('lets the author edit and marks the comment as edited', async () => {
    const created = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'Typo here' })
      .expect(201);

    const updated = await request(app)
      .put(`/api/tasks/${taskId}/comments/${created.body.data.id}`)
      .set(auth(memberToken))
      .send({ body: 'Fixed the typo' })
      .expect(200);

    expect(updated.body.data.body).toBe('Fixed the typo');
    expect(updated.body.data.editedAt).toBeDefined();
  });

  it('stops anyone else editing a comment, including the project owner', async () => {
    const created = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'My words' })
      .expect(201);

    await request(app)
      .put(`/api/tasks/${taskId}/comments/${created.body.data.id}`)
      .set(auth(ownerToken))
      .send({ body: 'Not my words' })
      .expect(403);
  });

  it('lets the author delete their own comment', async () => {
    const created = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'Never mind' })
      .expect(201);

    await request(app)
      .delete(`/api/tasks/${taskId}/comments/${created.body.data.id}`)
      .set(auth(memberToken))
      .expect(200);

    expect(await TaskComment.countDocuments({ taskId })).toBe(0);
  });

  it('lets the project owner moderate a comment they did not write', async () => {
    const created = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(memberToken))
      .send({ body: 'Off-topic' })
      .expect(201);

    await request(app)
      .delete(`/api/tasks/${taskId}/comments/${created.body.data.id}`)
      .set(auth(ownerToken))
      .expect(200);
  });
});
