import { randomUUID } from 'crypto';
import { extname } from 'path';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { config } from '@/config';

let isConfigured = false;

function configureCloudinary(): void {
  if (isConfigured) return;
  if (
    !config.CLOUDINARY_CLOUD_NAME ||
    !config.CLOUDINARY_API_KEY ||
    !config.CLOUDINARY_API_SECRET
  ) {
    throw new Error('Attachment storage is not configured');
  }
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });
  isConfigured = true;
}

export class TaskAttachmentStorageService {
  static upload(buffer: Buffer, filename: string): Promise<UploadApiResponse> {
    configureCloudinary();
    const extension = extname(filename).toLowerCase();
    const publicId = `${randomUUID()}${extension}`;

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          type: 'authenticated',
          folder: 'synergysphere/task-attachments',
          public_id: publicId,
          overwrite: false,
          use_filename: false,
          unique_filename: false,
        },
        (error, result) => {
          if (error || !result) reject(error || new Error('Attachment upload failed'));
          else resolve(result);
        }
      );
      stream.end(buffer);
    });
  }

  static delete(publicId: string): Promise<void> {
    configureCloudinary();
    return cloudinary.uploader
      .destroy(publicId, { resource_type: 'raw', type: 'authenticated' })
      .then(result => {
        if (result.result !== 'ok' && result.result !== 'not found') {
          throw new Error('Attachment deletion failed');
        }
      });
  }

  static privateDownloadUrl(publicId: string): string {
    configureCloudinary();
    return cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      type: 'authenticated',
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
  }
}
