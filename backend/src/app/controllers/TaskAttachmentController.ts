import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { basename, extname } from 'path';
import { Task } from '@/models';
import { AuthenticatedRequest } from '@/middleware';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { TaskAttachmentStorageService } from '@/services/TaskAttachmentStorageService';
import { ResponseUtils } from '@/utils';
import { emitToProject } from '@/infrastructure/socket';
import { param } from 'express-validator';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const acceptedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const multipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      callback(new Error('Only PDF, JPEG, PNG, GIF, and WebP files are allowed'));
      return;
    }
    callback(null, true);
  },
}).single('file');

export function handleTaskAttachmentUpload(req: Request, res: Response, next: NextFunction): void {
  multipartUpload(req, res, error => {
    if (!error) {
      next();
      return;
    }
    const isTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    ResponseUtils.error(
      res,
      isTooLarge ? 'Attachment must be 10 MB or smaller' : error.message,
      isTooLarge ? 413 : 400
    );
  });
}

function matchesFileSignature(mimeType: string, buffer: Buffer): boolean {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/jpeg')
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png')
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif')
    return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString());
  if (mimeType === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    );
  return false;
}

// Control characters are stripped deliberately: they are invalid in file names
// and are a path- and header-injection vector in Content-Disposition. Hoisted
// to a named constant so the disable comment cannot drift off the pattern when
// the formatter rewraps the call chain below.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function safeFilename(originalName: string): string {
  const withoutControlCharacters = originalName.replace(/\\/g, '/').replace(CONTROL_CHARACTERS, '');
  return basename(withoutControlCharacters).slice(0, 255) || 'attachment';
}

async function findAccessibleTask(
  taskId: string,
  userId: string,
  includeStorageId = false
): Promise<any | null> {
  let query = Task.findById(taskId).populate('projectId', 'ownerId members isActive');
  if (includeStorageId) query = query.select('+attachments.cloudinaryPublicId');
  const task = await query;
  if (!task) return null;
  const project = task.projectId as any;
  const isMember =
    project?.isActive &&
    (String(project.ownerId) === userId ||
      project.members.some((member: any) => String(member.userId) === userId));
  return isMember ? task : null;
}

export class TaskAttachmentController {
  static taskIdValidation = [param('id').isMongoId().withMessage('Invalid task ID')];
  static attachmentIdValidation = [
    param('id').isMongoId().withMessage('Invalid task ID'),
    param('attachmentId').isMongoId().withMessage('Invalid attachment ID'),
  ];

  static async upload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        ResponseUtils.error(res, 'Choose a file to upload', 400);
        return;
      }
      const filename = safeFilename(file.originalname);
      if (!matchesFileSignature(file.mimetype, file.buffer)) {
        ResponseUtils.error(res, 'File contents do not match the selected file type', 400);
        return;
      }
      const extension = extname(filename).toLowerCase();
      const expectedExtensions: Record<string, string[]> = {
        'application/pdf': ['.pdf'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/gif': ['.gif'],
        'image/webp': ['.webp'],
      };
      if (!expectedExtensions[file.mimetype]?.includes(extension)) {
        ResponseUtils.error(res, 'Filename extension does not match the file type', 400);
        return;
      }

      const task = await findAccessibleTask(req.params.id, String(req.user._id));
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }

      const stored = await TaskAttachmentStorageService.upload(file.buffer, filename);
      const projectId = String((task.projectId as any)._id);
      (task as any).attachments.push({
        filename,
        size: file.size,
        mimeType: file.mimetype,
        uploaderId: req.user._id,
        uploadedAt: new Date(),
        cloudinaryPublicId: stored.public_id,
      });

      try {
        await task.save();
      } catch (error) {
        await TaskAttachmentStorageService.delete(stored.public_id).catch(() => undefined);
        throw error;
      }

      const attachment = (task as any).attachments[(task as any).attachments.length - 1];
      await TaskHistoryService.record({
        taskId: String(task._id),
        projectId,
        actorId: String(req.user._id),
        type: 'TASK_UPDATED',
        source: 'user',
        description: `Attachment uploaded: ${filename}`,
        metadata: {
          action: 'ATTACHMENT_UPLOADED',
          attachmentId: String(attachment._id),
          filename,
          size: file.size,
        },
      });
      emitToProject(projectId, 'task:attachment-changed', {
        projectId,
        taskId: String(task._id),
        attachmentChanged: true,
      });

      ResponseUtils.created(
        res,
        {
          id: String(attachment._id),
          filename: attachment.filename,
          size: attachment.size,
          mimeType: attachment.mimeType,
          uploaderId: String(attachment.uploaderId),
          uploadedAt: attachment.uploadedAt,
        },
        'Attachment uploaded successfully'
      );
    } catch (error: any) {
      const storageUnavailable = error.message === 'Attachment storage is not configured';
      ResponseUtils.error(
        res,
        storageUnavailable ? error.message : 'Attachment upload failed',
        storageUnavailable ? 503 : 502
      );
    }
  }

  static async download(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findAccessibleTask(req.params.id, String(req.user._id), true);
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }
      const attachment = (task as any).attachments.id(req.params.attachmentId);
      if (!attachment) {
        ResponseUtils.notFound(res, 'Attachment not found');
        return;
      }

      const privateUrl = TaskAttachmentStorageService.privateDownloadUrl(
        attachment.cloudinaryPublicId
      );
      const storageResponse = await fetch(privateUrl);
      if (!storageResponse.ok) {
        ResponseUtils.error(res, 'Attachment is unavailable', 502);
        return;
      }
      const file = Buffer.from(await storageResponse.arrayBuffer());
      const inline =
        req.query.inline === 'true' &&
        (attachment.mimeType === 'application/pdf' || attachment.mimeType.startsWith('image/'));
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Length', file.length);
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(file);
    } catch {
      ResponseUtils.error(res, 'Attachment download failed', 502);
    }
  }

  static async remove(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const task = await findAccessibleTask(req.params.id, String(req.user._id), true);
      if (!task) {
        ResponseUtils.notFound(res, 'Task not found or access denied');
        return;
      }
      const attachment = (task as any).attachments.id(req.params.attachmentId);
      if (!attachment) {
        ResponseUtils.notFound(res, 'Attachment not found');
        return;
      }

      await TaskAttachmentStorageService.delete(attachment.cloudinaryPublicId);
      const filename = attachment.filename;
      const attachmentId = String(attachment._id);
      const projectId = String((task.projectId as any)._id);
      (task as any).attachments.pull(attachmentId);
      await task.save();
      await TaskHistoryService.record({
        taskId: String(task._id),
        projectId,
        actorId: String(req.user._id),
        type: 'TASK_UPDATED',
        source: 'user',
        description: `Attachment deleted: ${filename}`,
        metadata: { action: 'ATTACHMENT_DELETED', attachmentId, filename },
      });
      emitToProject(projectId, 'task:attachment-changed', {
        projectId,
        taskId: String(task._id),
        attachmentChanged: true,
      });
      ResponseUtils.success(res, null, 'Attachment deleted successfully');
    } catch {
      ResponseUtils.error(res, 'Attachment deletion failed', 502);
    }
  }
}
