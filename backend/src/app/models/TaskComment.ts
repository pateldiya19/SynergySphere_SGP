import mongoose, { Document, Schema } from 'mongoose';

export interface TaskCommentDocument extends Document {
  taskId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  body: string;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A comment on a single task.
 *
 * Deliberately separate from Thread/Reply, which are project-wide discussions:
 * those are a forum, this is the conversation attached to one piece of work.
 * `projectId` is denormalised so membership can be checked, and comments
 * listed, without loading the task first.
 */
const taskCommentSchema = new Schema<TaskCommentDocument>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: {
      type: String,
      required: [true, 'Comment body is required'],
      trim: true,
      maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    },
    /** Set when the author edits, so the UI can mark the comment as edited. */
    editedAt: { type: Date },
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

taskCommentSchema.index({ taskId: 1, createdAt: 1 });

export const TaskComment = mongoose.model<TaskCommentDocument>('TaskComment', taskCommentSchema);
