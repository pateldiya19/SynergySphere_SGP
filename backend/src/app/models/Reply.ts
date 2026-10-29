import mongoose, { Document, Schema } from 'mongoose';
import { Reply as IReply } from '@/types';

export interface ReplyDocument extends Omit<IReply, '_id'>, Document {}

const replySchema = new Schema<any>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: 'Thread',
      required: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: [true, 'Reply body is required'],
      trim: true,
      maxlength: [2000, 'Reply cannot exceed 2000 characters'],
    },
    attachments: [
      {
        type: String,
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
replySchema.index({ threadId: 1, createdAt: 1 });
replySchema.index({ authorId: 1 });

export const Reply = mongoose.model<ReplyDocument>('Reply', replySchema);
