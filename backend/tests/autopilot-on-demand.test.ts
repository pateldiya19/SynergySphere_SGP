import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Project, Task, User } from '../src/app/models';
import { AutopilotAiService } from '../src/app/services/AutopilotAiService';
import { AutopilotService } from '../src/app/services/AutopilotService';
import { JWTUtils } from '../src/core/utils/jwt';

/**
 * AI analysis costs provider quota, so it must happen only when a user asks
 * for it. These tests pin that down from both directions: the paths that must
 * never reach a provider, and the one path that should.
 */
describe('Autopilot runs AI only on demand', () => {
  let app: Express;
  let ownerToken: string;
  let projectId: string;
  let runSpy: jest.SpyInstance;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    const owner = await User.create({
      name: 'Autopilot Owner',
      email: 'autopilot-owner@example.com',
      password: 'password123',
    });
    ownerToken = JWTUtils.generateAccessToken({
      userId: String(owner._id),
      email: owner.email,
    });

    const project = await Project.create({
      name: 'On demand project',
      ownerId: owner._id,
      members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
    });
    projectId = String(project._id);

    await Task.create({
      projectId: project._id,
      title: 'Blocked work',
      status: 'blocked',
      assigneeId: owner._id,
      dueDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    // Spying on `run` is the honest check: it is the single entry point to the
    // provider, so a call here means quota would have been spent.
    runSpy = jest.spyOn(AutopilotAiService, 'run');
  });

  afterEach(() => {
    runSpy.mockRestore();
  });

  it('does not call the AI provider when the board is loaded', async () => {
    const response = await request(app)
      .get(`/api/autopilot/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(runSpy).not.toHaveBeenCalled();
    expect(response.body.data.ai.available).toBe(false);
    expect(response.body.data.ai.summary).toBe('');
  });

  it('still detects risks deterministically with no provider configured', async () => {
    const response = await request(app)
      .get(`/api/autopilot/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(runSpy).not.toHaveBeenCalled();
    expect(response.body.data.risks.length).toBeGreaterThan(0);
  });

  it('does not call the AI provider during scheduled monitoring', async () => {
    await AutopilotService.monitorProjects();

    expect(runSpy).not.toHaveBeenCalled();
  });

  it('calls the provider when an analysis is explicitly requested', async () => {
    runSpy.mockResolvedValue({
      available: true,
      status: { configured: true, provider: 'openai', model: 'test-model' },
      result: {
        summary: 'Mocked analysis.',
        reasoning: 'Mocked reasoning.',
        recommendations: [],
        verifiedFacts: [],
        estimates: [],
      },
    } as any);

    const response = await request(app)
      .post(`/api/autopilot/${projectId}/analyze`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(response.body.data.ai.available).toBe(true);
    expect(response.body.data.ai.summary).toBe('Mocked analysis.');
  });

  it('reports a provider failure instead of returning an empty analysis', async () => {
    runSpy.mockResolvedValue({
      available: false,
      status: { configured: true, provider: 'openai', model: 'test-model' },
      result: {
        summary: '',
        reasoning: '',
        recommendations: [],
        verifiedFacts: [],
        estimates: [],
      },
      error: 'The configured AI provider could not complete this request.',
    } as any);

    const response = await request(app)
      .post(`/api/autopilot/${projectId}/analyze`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(502);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/could not complete/i);
    // The deterministic board is still returned so the UI keeps working.
    expect(response.body.data.risks.length).toBeGreaterThan(0);
  });

  it('says so plainly when no provider is configured', async () => {
    const response = await request(app)
      .post(`/api/autopilot/${projectId}/analyze`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(503);

    expect(response.body.error).toMatch(/no ai provider is configured/i);
  });

  it('refuses analysis for someone outside the project', async () => {
    const outsider = await User.create({
      name: 'Outsider',
      email: 'autopilot-outsider@example.com',
      password: 'password123',
    });
    const outsiderToken = JWTUtils.generateAccessToken({
      userId: String(outsider._id),
      email: outsider.email,
    });

    await request(app)
      .post(`/api/autopilot/${projectId}/analyze`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    expect(runSpy).not.toHaveBeenCalled();
  });
});
