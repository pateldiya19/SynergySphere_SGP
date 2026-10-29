import { Response } from 'express';
import { param, query } from 'express-validator';
import { Notification } from '@/models';
import { ResponseUtils } from '@/utils';
import { AuthenticatedRequest } from '@/middleware';

export class NotificationController {
  static listValidation = [
    query('read').optional().isBoolean().withMessage('read must be a boolean'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100'),
  ];

  static idValidation = [param('id').isMongoId().withMessage('Invalid notification ID')];

  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const filter: Record<string, unknown> = { userId: req.user._id };
      if (req.query.read !== undefined) filter.read = req.query.read === 'true';
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      ResponseUtils.success(res, notifications, 'Notifications retrieved successfully');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async markRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { read: true },
        { new: true, runValidators: true }
      ).lean();

      if (!notification) {
        ResponseUtils.notFound(res, 'Notification not found');
        return;
      }

      ResponseUtils.success(res, notification, 'Notification marked as read');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }

  static async markAllRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
      ResponseUtils.success(res, null, 'Notifications marked as read');
    } catch (error: any) {
      ResponseUtils.serverError(res, error.message);
    }
  }
}
