import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { AutopilotRecord, Project, Task, User } from '../src/app/models';
import { AutopilotAiService } from '../src/app/services/AutopilotAiService';
import { JWTUtils } from '../src/core/utils/jwt';

describe('Autopilot analysis and action decisions', () => {
  let app: Express;
  let ownerId: string;
  let managerId: string;
  let memberId: string;
  let projectId: string;
  let taskId: string;
  let ownerToken: string;
  let memberToken: string;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    const owner = await User.create({
      name: 'Project Owner',
      email: 'owner@example.com',
      password: 'password123',
    });
    const manager = await User.create({
      name: 'Project Manager',
      email: 'manager@example.com',
      password: 'password123',
    });
    const member = await User.create({
      name: 'Project Member',
      email: 'member@example.com',
      password: 'password123',
    });
    ownerId = String(owner._id);
    managerId = String(manager._id);
    memberId = String(member._id);
    ownerToken = JWTUtils.generateAccessToken({ userId: ownerId, email: owner.email });
    memberToken = JWTUtils.generateAccessToken({ userId: memberId, email: member.email });
    const project = await Project.create({
      name: 'Real delivery project',
      ownerId,
      members: [
        { userId: ownerId, role: 'owner' },
        { userId: managerId, role: 'manager' },
        { userId: memberId, role: 'member' },
      ],
    });
    projectId = String(project._id);
    const task = await Task.create({
      projectId,
      title: 'Ship the release',
      status: 'blocked',
      priority: 'high',
      assigneeId: ownerId,
    });
    taskId = String(task._id);
  });

  it('uses persisted project data and rejects fabricated AI evidence', async () => {
    jest.spyOn(AutopilotAiService, 'run').mockResolvedValue({
      available: true,
      status: { configured: true, provider: 'openai', model: 'mock-model' },
      result: {
        summary: 'Grounded analysis',
        reasoning: 'Mocked model output.',
        recommendations: [
          {
            title: 'Fabricated signal',
            summary: 'This evidence is not present in the project.',
            severity: 'high',
            reasoning: 'Mocked model output.',
            evidence: [{ label: 'Task', value: 'TASK-999 · Invented task' }],
            action: { type: 'update_priority', taskId, priority: 'urgent' },
          },
          {
            title: 'Prioritize the blocked release',
            summary: 'Keep the actual blocked task visible.',
            severity: 'high',
            reasoning: 'The current task is blocked.',
            evidence: [{ label: 'Task', value: 'TASK-1 · Ship the release' }],
            action: { type: 'update_priority', taskId, priority: 'urgent' },
          },
        ],
        verifiedFacts: ['0 of 1 tasks are complete.', '999 active risk signals are present.'],
        estimates: [],
      },
    });

    const response = await request(app)
      .post(`/api/autopilot/${projectId}/analyze`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const analysis = response.body.data;
    expect(analysis.context.project.name).toBe('Real delivery project');
    expect(analysis.context.tasks[0].title).toBe('Ship the release');
    expect(analysis.ai.available).toBe(true);

    const aiRecords = analysis.recommendations.filter((record: any) => record.source === 'ai');
    expect(aiRecords).toHaveLength(1);
    expect(aiRecords[0].title).toBe('Prioritize the blocked release');
    expect(aiRecords[0].evidence).toEqual([
      expect.objectContaining({ label: 'Task', value: 'TASK-1 · Ship the release' }),
    ]);
    expect(aiRecords[0].verifiedFacts).toEqual(['0 of 1 tasks are complete.']);
  });

  it('streams deterministic answers from the current project context when no provider is configured', async () => {
    const answer = await request(app)
      .post(`/api/autopilot/${projectId}/assistant`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'What is the current progress?' })
      .expect(200);
    expect(answer.body.data.answer).toContain('0%');
    expect(answer.body.data.ai.available).toBe(false);

    const response = await request(app)
      .post(`/api/autopilot/${projectId}/assistant/stream`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'What is the current progress?' })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('event: token');
    expect(response.text).toContain('0% complete');
    expect(response.text).toContain('event: complete');
    const chat = await AutopilotRecord.findOne({
      projectId,
      type: 'chat',
      question: 'What is the current progress?',
    });
    expect(chat?.source).toBe('deterministic');
  });

  it('executes a pending approval once and rejects a second execution', async () => {
    const recommendation = await AutopilotRecord.create({
      projectId,
      type: 'recommendation',
      status: 'pending',
      title: 'Prioritize release',
      summary: 'Raise the task priority.',
      evidence: [{ label: 'Task', value: 'TASK-1 · Ship the release' }],
      action: { type: 'update_priority', taskId, priority: 'urgent' },
    });

    const decisions = await Promise.all([
      request(app)
        .post(`/api/autopilot/actions/${recommendation.id}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`),
      request(app)
        .post(`/api/autopilot/actions/${recommendation.id}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`),
    ]);
    expect(decisions.map(response => response.status).sort()).toEqual([200, 400]);
    expect((await Task.findById(taskId))?.priority).toBe('urgent');
    expect((await AutopilotRecord.findById(recommendation.id))?.status).toBe('executed');

    const secondAttempt = await request(app)
      .post(`/api/autopilot/actions/${recommendation.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    expect(secondAttempt.body.error).toContain('no longer pending');
  });

  it('allows managers to reject and denies members the decision', async () => {
    const recommendation = await AutopilotRecord.create({
      projectId,
      type: 'recommendation',
      status: 'pending',
      title: 'Potential action',
      summary: 'Review before deciding.',
      evidence: [{ label: 'Task', value: 'TASK-1 · Ship the release' }],
      action: { type: 'update_priority', taskId, priority: 'urgent' },
    });

    await request(app)
      .post(`/api/autopilot/actions/${recommendation.id}/reject`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    expect((await AutopilotRecord.findById(recommendation.id))?.status).toBe('pending');

    const manager = await User.findById(managerId);
    const managerToken = JWTUtils.generateAccessToken({
      userId: managerId,
      email: manager!.email,
    });
    await request(app)
      .post(`/api/autopilot/actions/${recommendation.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect((await AutopilotRecord.findById(recommendation.id))?.status).toBe('rejected');
    expect((await Task.findById(taskId))?.priority).toBe('high');
  });
});
