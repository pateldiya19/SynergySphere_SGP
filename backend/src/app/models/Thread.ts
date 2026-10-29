import mongoose, { Document, Schema } from 'mongoose';
import { Thread as IThread } from '@/types';

export interface ThreadDocument extends Omit<IThread, '_id'>, Document {}

const threadSchema = new Schema<any>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Thread title is required'],
      trim: true,
      maxlength: [200, 'Thread title cannot exceed 200 characters'],
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    replyCount: {
      type: Number,
      default: 0,
    },
    lastReplyAt: {
      type: Date,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
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
threadSchema.index({ projectId: 1, createdAt: -1 });
threadSchema.index({ authorId: 1 });
threadSchema.index({ lastReplyAt: -1 });
threadSchema.index({ title: 'text' });

export const Thread = mongoose.model<ThreadDocument>('Thread', threadSchema);
