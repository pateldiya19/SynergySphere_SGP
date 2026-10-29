import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Notification, Project, Task, User } from '../src/app/models';
import { TaskReminderService } from '../src/app/services/TaskReminderService';

describe('Due-date and overdue task reminders', () => {
  let app: Express;
  let ownerToken: string;
  let assigneeId: string;
  let projectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await Notification.deleteMany({});

    const register = async (name: string, email: string) =>
      request(app)
        .post('/api/auth/register')
        .send({ name, email, password: 'password123' })
        .expect(201);

    const owner = await register('Reminder Owner', 'reminder-owner@example.com');
    const assignee = await register('Reminder Assignee', 'reminder-assignee@example.com');
    ownerToken = owner.body.data.accessToken;
    assigneeId = String(assignee.body.data.user.id || assignee.body.data.user._id);

    const project = await request(app)
      .post('/api/projects')
      .set(auth(ownerToken))
      .send({ name: 'Reminder project' })
      .expect(201);
    projectId = project.body.data.id;

    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(auth(ownerToken))
      .send({ userId: assigneeId, role: 'member' });
  });

  /** Create a task directly so an arbitrary due date can be set. */
  async function createTask(overrides: Record<string, unknown> = {}) {
    return Task.create({
      projectId,
      title: 'Ship the thing',
      assigneeId,
      status: 'in_progress',
      ...overrides,
    });
  }

  async function notificationsOfType(type: string) {
    return Notification.find({ type, userId: assigneeId }).lean();
  }

  it('notifies the assignee about a task due within a day', async () => {
    await createTask({ dueDate: new Date(Date.now() + 6 * 60 * 60 * 1000) });

    const result = await TaskReminderService.runSweep();

    expect(result.due).toBe(1);
    const notifications = await notificationsOfType('task_due');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('Ship the thing');
    expect(String(notifications[0].payload.projectId)).toBe(projectId);
  });

  it('notifies the assignee about a task whose due date has passed', async () => {
    await createTask({ dueDate: new Date(Date.now() - 2 * DAY_MS) });

    const result = await TaskReminderService.runSweep();

    expect(result.overdue).toBe(1);
    expect(await notificationsOfType('task_overdue')).toHaveLength(1);
  });

  it('does not notify twice, however often the sweep runs', async () => {
    await createTask({ dueDate: new Date(Date.now() - DAY_MS) });

    await TaskReminderService.runSweep();
    await TaskReminderService.runSweep();
    const third = await TaskReminderService.runSweep();

    expect(third.overdue).toBe(0);
    expect(await notificationsOfType('task_overdue')).toHaveLength(1);
  });

  it('ignores tasks that are finished, unassigned, or have no due date', async () => {
    await createTask({ dueDate: new Date(Date.now() - DAY_MS), status: 'done' });
    await createTask({ dueDate: new Date(Date.now() - DAY_MS), assigneeId: null });
    await createTask({ dueDate: null });

    const result = await TaskReminderService.runSweep();

    expect(result).toEqual({ due: 0, overdue: 0 });
    expect(await Notification.countDocuments({ type: { $in: ['task_due', 'task_overdue'] } })).toBe(
      0
    );
  });

  it('ignores a task due further out than the reminder window', async () => {
    await createTask({ dueDate: new Date(Date.now() + 5 * DAY_MS) });

    expect(await TaskReminderService.runSweep()).toEqual({ due: 0, overdue: 0 });
  });

  it('reminds again after the due date is rescheduled', async () => {
    const task = await createTask({ dueDate: new Date(Date.now() - DAY_MS) });
    await TaskReminderService.runSweep();
    expect(await notificationsOfType('task_overdue')).toHaveLength(1);

    // Moving the due date through the API clears the suppression stamps.
    await request(app)
      .put(`/api/tasks/${task._id}`)
      .set(auth(ownerToken))
      .send({ dueDate: new Date(Date.now() - 2 * DAY_MS).toISOString() })
      .expect(200);

    const second = await TaskReminderService.runSweep();
    expect(second.overdue).toBe(1);
    expect(await notificationsOfType('task_overdue')).toHaveLength(2);
  });

  it('sends an overdue reminder rather than a due-soon one for a late task', async () => {
    await createTask({ dueDate: new Date(Date.now() - 60 * 1000) });

    const result = await TaskReminderService.runSweep();

    expect(result).toEqual({ due: 0, overdue: 1 });
  });

  it('surfaces the reminder through the notifications API the bell reads', async () => {
    await createTask({ dueDate: new Date(Date.now() - DAY_MS) });
    await TaskReminderService.runSweep();

    const assigneeLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reminder-assignee@example.com', password: 'password123' })
      .expect(200);

    const response = await request(app)
      .get('/api/notifications?limit=50')
      .set(auth(assigneeLogin.body.data.accessToken))
      .expect(200);

    const reminder = response.body.data.find((item: any) => item.type === 'task_overdue');
    expect(reminder).toBeDefined();
    expect(reminder.read).toBe(false);
    expect(reminder.payload.taskId).toBeDefined();
  });
});
