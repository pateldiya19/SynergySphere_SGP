import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { Project, Task, TaskHistory, User } from '../src/app/models';
import { TaskAttachmentStorageService } from '../src/app/services/TaskAttachmentStorageService';

describe('Task attachments', () => {
  let app: Express;
  let ownerToken: string;
  let outsiderToken: string;
  let ownerId: string;
  let projectId: string;
  let taskId: string;

  beforeAll(() => {
    app = createApp() as Express;
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await TaskHistory.deleteMany({});

    const owner = await request(app).post('/api/auth/register').send({
      name: 'Attachment Owner',
      email: 'attachment-owner@example.com',
      password: 'password123',
    });
    ownerToken = owner.body.data.accessToken;
    ownerId = owner.body.data.user.id || owner.body.data.user._id;
    const outsider = await request(app).post('/api/auth/register').send({
      name: 'Attachment Outsider',
      email: 'attachment-outsider@example.com',
      password: 'password123',
    });
    outsiderToken = outsider.body.data.accessToken;

    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Attachment Project' })
      .expect(201);
    projectId = project.body.data.id;
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Attachment task' })
      .expect(201);
    taskId = task.body.data.id;
  });

  it('rejects upload, download, and deletion for users outside the project', async () => {
    const validPdf = Buffer.from('%PDF-1.4\n');
    await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .attach('file', validPdf, { filename: 'private.pdf', contentType: 'application/pdf' })
      .expect(404);

    const task = await Task.findById(taskId);
    (task as any).attachments.push({
      filename: 'private.pdf',
      size: validPdf.length,
      mimeType: 'application/pdf',
      uploaderId: ownerId,
      uploadedAt: new Date(),
      cloudinaryPublicId: 'private/test.pdf',
    });
    await task!.save();
    const attachmentId = String((task as any).attachments[0]._id);

    await request(app)
      .get(`/api/tasks/${taskId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
    await request(app)
      .delete(`/api/tasks/${taskId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    await Project.findByIdAndUpdate(projectId, { isActive: false });
    await request(app)
      .get(`/api/tasks/${taskId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('rejects unsupported MIME types and file contents that do not match the MIME type', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'script.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);

    await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from('not a pdf'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
  });

  it('returns attachment metadata without exposing the provider storage identifier', async () => {
    const task = await Task.findById(taskId);
    (task as any).attachments.push({
      filename: 'design.pdf',
      size: 128,
      mimeType: 'application/pdf',
      uploaderId: ownerId,
      uploadedAt: new Date('2026-09-01T12:00:00.000Z'),
      cloudinaryPublicId: 'private/task-attachments/opaque-id.pdf',
    });
    await task!.save();

    const response = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.data.attachments).toHaveLength(1);
    expect(response.body.data.attachments[0]).toMatchObject({
      filename: 'design.pdf',
      size: 128,
      mimeType: 'application/pdf',
    });
    expect(JSON.stringify(response.body.data)).not.toContain('opaque-id');
  });

  it('uploads, downloads, and deletes through private storage while recording history', async () => {
    const pdf = Buffer.from('%PDF-1.4\nattachment data');
    jest
      .spyOn(TaskAttachmentStorageService, 'upload')
      .mockResolvedValue({ public_id: 'private/task-attachments/opaque.pdf' } as any);
    const uploaded = await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', pdf, { filename: 'brief.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(uploaded.body.data).toMatchObject({
      filename: 'brief.pdf',
      size: pdf.length,
      mimeType: 'application/pdf',
    });
    const attachmentId = uploaded.body.data.id;

    jest
      .spyOn(TaskAttachmentStorageService, 'privateDownloadUrl')
      .mockReturnValue('https://storage.invalid/private-download');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
    } as Response);
    const downloaded = await request(app)
      .get(`/api/tasks/${taskId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(fetchSpy).toHaveBeenCalledWith('https://storage.invalid/private-download');
    expect(downloaded.headers['content-disposition']).toContain('brief.pdf');

    jest.spyOn(TaskAttachmentStorageService, 'delete').mockResolvedValue();
    await request(app)
      .delete(`/api/tasks/${taskId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const history = await TaskHistory.find({ taskId }).lean();
    expect(history.some(item => item.metadata?.action === 'ATTACHMENT_UPLOADED')).toBe(true);
    expect(history.some(item => item.metadata?.action === 'ATTACHMENT_DELETED')).toBe(true);
  });

  it('rejects attachments larger than 10 MB', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
  });
});
