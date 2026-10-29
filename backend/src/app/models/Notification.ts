import mongoose, { Document, Schema } from 'mongoose';
import { Notification as INotification } from '@/types';

export interface NotificationDocument extends Omit<INotification, '_id'>, Document {}

const notificationSchema = new Schema<any>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'task_assigned',
        'task_reassigned',
        'task_unassigned',
        'task_status_changed',
        'task_completed',
        'task_due',
        'task_overdue',
        'task_comment',
        'task_dependency_changed',
        'task_blocked',
        'thread_new',
        'reply_new',
        'project_invite',
        'project_invite_accepted',
        'project_invite_declined',
        'project_invite_cancelled',
        'project_member_added',
        'project_member_removed',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc: any, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for performance
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

// Auto-delete read notifications older than 30 days
notificationSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { read: true },
  }
);

export const Notification = mongoose.model<NotificationDocument>(
  'Notification',
  notificationSchema
);
