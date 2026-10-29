import mongoose, { Document, Schema } from 'mongoose';
import { TaskHistory as ITaskHistory, TaskHistoryType } from '@/types';

export interface TaskHistoryDocument extends Omit<ITaskHistory, '_id'>, Document {}

const taskHistorySchema = new Schema<any>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: [
        'TASK_CREATED',
        'TASK_ASSIGNED',
        'TASK_COMPLETED',
        'STATUS_CHANGED',
        'PRIORITY_CHANGED',
        'DEADLINE_CHANGED',
        'TASK_UPDATED',
        'TASK_DELETED',
        'DEPENDENCY_ADDED',
        'DEPENDENCY_REMOVED',
        'MEMBER_ADDED',
        'MEMBER_REMOVED',
        'GIT_COMMIT',
        'PULL_REQUEST_CREATED',
        'PULL_REQUEST_UPDATED',
        'PULL_REQUEST_CLOSED',
        'PULL_REQUEST_MERGED',
      ] satisfies TaskHistoryType[],
      required: true,
    },
    source: { type: String, enum: ['user', 'github', 'system'], required: true },
    description: { type: String, required: true, maxlength: 1000 },
    changes: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: any, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

taskHistorySchema.index({ taskId: 1, createdAt: -1 });
export const TaskHistory = mongoose.model<TaskHistoryDocument>('TaskHistory', taskHistorySchema);
