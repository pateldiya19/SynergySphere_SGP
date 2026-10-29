import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Project, User } from '../src/app/models';

describe('GitHub project connection', () => {
  let app: Express;
  let accessToken: string;
  let projectId: string;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    const registration = await request(app)
      .post('/api/auth/register')
      .send({ name: 'GitHub Owner', email: 'github-owner@example.com', password: 'password123' });
    accessToken = registration.body.data.accessToken;
  });

  it('connects and normalizes repository metadata when creating a project', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Connected Project', github: { owner: 'Acme', name: 'Backend' } })
      .expect(201);

    projectId = response.body.data.id || response.body.data._id;
    expect(response.body.data.github).toEqual({
      owner: 'acme',
      name: 'backend',
      url: 'https://github.com/acme/backend',
    });
  });

  it('updates and disconnects repository metadata for the project owner', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Update Project' })
      .expect(201);
    projectId = created.body.data.id || created.body.data._id;

    const updated = await request(app)
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ github: { owner: 'Acme', name: 'Frontend' } })
      .expect(200);
    expect(updated.body.data.github.name).toBe('frontend');

    const disconnected = await request(app)
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ github: null })
      .expect(200);
    expect(disconnected.body.data.github).toBeUndefined();
  });
});
