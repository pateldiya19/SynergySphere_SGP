import mongoose, { Document, Schema } from 'mongoose';
import { Task as ITask } from '@/types';

export interface TaskDocument extends Omit<ITask, '_id'>, Document {}

const taskAttachmentSchema = new Schema({
  filename: { type: String, required: true, trim: true, maxlength: 255 },
  size: { type: Number, required: true, min: 1 },
  mimeType: { type: String, required: true },
  uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, required: true, default: Date.now },
  cloudinaryPublicId: { type: String, required: true, select: false },
});

const taskProofCommitSchema = new Schema(
  {
    sha: { type: String, required: true },
    message: { type: String, trim: true, maxlength: 1000 },
    url: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const taskProofSchema = new Schema({
  type: { type: String, enum: ['github', 'demo_url', 'developer_notes'], required: true },
  source: { type: String, enum: ['user', 'github'], required: true, default: 'user' },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, required: true, default: Date.now },
  url: { type: String, trim: true, maxlength: 1000 },
  notes: { type: String, trim: true, maxlength: 5000 },
  repository: { type: String, trim: true, maxlength: 200 },
  pullRequestNumber: { type: Number },
  pullRequestTitle: { type: String, trim: true, maxlength: 500 },
  pullRequestAuthor: { type: String, trim: true, maxlength: 100 },
  // Set when the PR/commit author's GitHub login can be compared with the
  // assignee's linked account. Left undefined when either side is unlinked.
  pullRequestAuthorId: { type: Number },
  authorMatchesAssignee: { type: Boolean },
  state: { type: String, enum: ['open', 'closed', 'merged'] },
  branch: { type: String, trim: true, maxlength: 500 },
  commits: { type: [taskProofCommitSchema], default: [] },
  commitCount: { type: Number },
  filesChanged: { type: Number },
  additions: { type: Number },
  deletions: { type: Number },
  merged: { type: Boolean, default: false },
  lastUpdatedAt: { type: Date },
});

const taskProofReviewSchema = new Schema({
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  decision: { type: String, enum: ['approved', 'changes_requested'], required: true },
  comment: { type: String, trim: true, maxlength: 2000 },
  reviewedAt: { type: Date, required: true, default: Date.now },
});
taskAttachmentSchema.set('toJSON', {
  transform: (_document: any, result: any) => {
    delete result.cloudinaryPublicId;
    return result;
  },
});

const taskSchema = new Schema<any>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [200, 'Task title cannot exceed 200 characters'],
    },
    taskKey: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    requiresGitHubEvidence: {
      type: Boolean,
      default: false,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'blocked', 'ready_for_review', 'changes_requested', 'done'],
      default: 'todo',
    },
    // Stamped when a due-soon / overdue reminder has been sent for this task.
    // The reminder sweep only matches tasks where these are unset, so a task
    // can never be reminded about twice, however often the sweep runs. Cleared
    // when the due date moves so a rescheduled task reminds again.
    dueReminderSentAt: { type: Date },
    overdueReminderSentAt: { type: Date },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    subtasks: [
      {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        completed: { type: Boolean, default: false },
      },
    ],
    dependencies: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    attachments: [
      {
        type: taskAttachmentSchema,
      },
    ],
    proofOfWork: { type: [taskProofSchema], default: [] },
    proofReviews: { type: [taskProofReviewSchema], default: [] },
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
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assigneeId: 1, status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ title: 'text', description: 'text' });
taskSchema.index({ projectId: 1, taskKey: 1 }, { unique: true });

taskSchema.pre('validate', async function (next) {
  const document = this as any;
  if (!document.taskKey) {
    const existingTasks = await mongoose
      .model('Task')
      .find({ projectId: document.projectId })
      .select('taskKey')
      .lean();
    const highestKey = existingTasks.reduce((highest: number, existing: any) => {
      const number = Number(String(existing.taskKey || '').replace('TASK-', ''));
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 0);
    document.taskKey = `TASK-${highestKey + 1}`;
  }
  next();
});

export const Task = mongoose.model<TaskDocument>('Task', taskSchema);
