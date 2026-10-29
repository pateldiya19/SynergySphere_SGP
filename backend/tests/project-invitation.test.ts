import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Project, ProjectInvitation, Notification, Task, User } from '../src/app/models';

describe('Project invitation workflow', () => {
  let app: Express;
  let ownerToken: string;
  let ownerId: string;
  let memberToken: string;
  let memberId: string;
  let projectId: string;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await ProjectInvitation.deleteMany({});
    await Notification.deleteMany({});
    await Task.deleteMany({});

    const owner = await request(app).post('/api/auth/register').send({
      name: 'Workflow Owner',
      email: 'workflow-owner@example.com',
      password: 'password123',
    });
    ownerToken = owner.body.data.accessToken;
    ownerId = owner.body.data.user.id || owner.body.data.user._id;

    const member = await request(app).post('/api/auth/register').send({
      name: 'Workflow Member',
      email: 'workflow-member@example.com',
      password: 'password123',
    });
    memberToken = member.body.data.accessToken;
    memberId = member.body.data.user.id || member.body.data.user._id;

    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Invitation Project' })
      .expect(201);
    projectId = project.body.data.id;
  });

  it('invites, accepts, and exposes assigned work to the new member', async () => {
    const invitation = await request(app)
      .post(`/api/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(201);

    expect(invitation.body.data.status).toBe('pending');

    const incoming = await request(app)
      .get('/api/invitations')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(incoming.body.data).toHaveLength(1);

    await request(app)
      .patch(`/api/invitations/${invitation.body.data.id || invitation.body.data._id}/accept`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const project = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(
      project.body.data.members.some(
        (member: any) => String(member.userId.id || member.userId) === memberId
      )
    ).toBe(true);

    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Assigned workflow task', assigneeId: memberId })
      .expect(201);

    const myTasks = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const taskId = task.body.data.id || task.body.data._id;
    expect(myTasks.body.data.some((item: any) => item.id === taskId || item._id === taskId)).toBe(
      true
    );
  });

  it('rejects duplicate pending invitations and lets the owner cancel one', async () => {
    const invitation = await request(app)
      .post(`/api/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(201);

    await request(app)
      .post(`/api/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(409);

    const invitationId = invitation.body.data.id || invitation.body.data._id;
    await request(app)
      .delete(`/api/projects/${projectId}/invitations/${invitationId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const cancelled = await ProjectInvitation.findById(invitationId);
    expect(cancelled?.status).toBe('cancelled');

    const incoming = await request(app)
      .get('/api/invitations')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(incoming.body.data).toHaveLength(0);
  });

  it('enforces project membership for assignment and supports reassignment and unassignment', async () => {
    const outsider = await request(app).post('/api/auth/register').send({
      name: 'Assignment Outsider',
      email: 'assignment-outsider@example.com',
      password: 'password123',
    });
    const outsiderToken = outsider.body.data.accessToken;
    const outsiderId = outsider.body.data.user.id || outsider.body.data.user._id;

    await request(app)
      .post(`/api/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(201);
    const invitation = await ProjectInvitation.findOne({
      projectId,
      inviteeId: memberId,
      status: 'pending',
    });
    await request(app)
      .patch(`/api/invitations/${invitation?._id}/accept`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Membership assignment task', assigneeId: outsiderId })
      .expect(400);

    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Reassignable task', assigneeId: memberId })
      .expect(201);
    const taskId = task.body.data.id || task.body.data._id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ assigneeId: ownerId })
      .expect(200);

    const unassigned = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ assigneeId: null })
      .expect(200);
    expect(unassigned.body.data.assigneeId).toBeNull();

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ assigneeId: memberId })
      .expect(403);
  });

  it('supports advanced task fields and overdue filtering', async () => {
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        projectId,
        title: 'Advanced task',
        description: 'Task details',
        priority: 'urgent',
        status: 'blocked',
        dueDate: '2020-01-01T00:00:00.000Z',
        subtasks: [{ title: 'Review checklist', completed: false }],
      })
      .expect(201);
    const taskId = task.body.data.id || task.body.data._id;

    expect(task.body.data.priority).toBe('urgent');
    expect(task.body.data.status).toBe('blocked');
    expect(task.body.data.subtasks).toHaveLength(1);

    const overdue = await request(app)
      .get(`/api/tasks/project/${projectId}?overdue=true&priority=urgent&sort=dueDate&order=asc`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(overdue.body.data.some((item: any) => String(item.id || item._id) === taskId)).toBe(
      true
    );

    const updated = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subtasks: [{ title: 'Review checklist', completed: true }] })
      .expect(200);
    expect(updated.body.data.subtasks[0].completed).toBe(true);
  });
});
