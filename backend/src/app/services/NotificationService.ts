import { Notification, NotificationDocument } from '@/models';
import { NotificationType } from '@/types';
import { emitToUser } from '@/infrastructure/socket';
import { logger } from '@/utils';

type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
};

export class NotificationService {
  static async create(input: NotificationInput): Promise<NotificationDocument | null> {
    try {
      const notification = await Notification.create(input);
      emitToUser(input.userId, 'notification:new', notification);
      return notification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      return null;
    }
  }

  static async createMany(inputs: NotificationInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      const notifications = await Notification.insertMany(inputs);
      notifications.forEach((notification: any) => {
        emitToUser(String(notification.userId), 'notification:new', notification);
      });
    } catch (error) {
      logger.error('Failed to create notifications:', error);
    }
  }
}
