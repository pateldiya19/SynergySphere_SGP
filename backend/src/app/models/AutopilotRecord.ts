import mongoose, { Document, Schema } from 'mongoose';

export type AutopilotRecordType = 'risk' | 'recommendation' | 'chat';
export type AutopilotRecordStatus =
  | 'observed'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'resolved';

export interface AutopilotRecordDocument extends Document {
  projectId: mongoose.Types.ObjectId;
  type: AutopilotRecordType;
  status: AutopilotRecordStatus;
  fingerprint?: string;
  title: string;
  summary: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  source?: 'deterministic' | 'ai';
  reasoning?: string;
  verifiedFacts: string[];
  estimates: string[];
  evidence: Array<{ label: string; value: string }>;
  action?: {
    type: 'assign_task' | 'reschedule_task' | 'update_priority';
    taskId: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
    dueDate?: Date;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  };
  question?: string;
  answer?: string;
  result?: string;
  actorId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const autopilotRecordSchema = new Schema<AutopilotRecordDocument>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ['risk', 'recommendation', 'chat'], required: true },
    status: {
      type: String,
      enum: ['observed', 'pending', 'approved', 'rejected', 'executed', 'failed', 'resolved'],
      required: true,
    },
    fingerprint: { type: String, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    source: { type: String, enum: ['deterministic', 'ai'], default: 'deterministic' },
    reasoning: { type: String, trim: true, maxlength: 5000 },
    verifiedFacts: { type: [String], default: [] },
    estimates: { type: [String], default: [] },
    evidence: {
      type: [{ label: String, value: String }],
      default: [],
    },
    action: {
      type: {
        type: String,
        enum: ['assign_task', 'reschedule_task', 'update_priority'],
      },
      taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
      assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
      dueDate: Date,
      priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'] },
    },
    question: { type: String, trim: true, maxlength: 1000 },
    answer: { type: String, trim: true, maxlength: 5000 },
    result: { type: String, trim: true, maxlength: 2000 },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

autopilotRecordSchema.index({ projectId: 1, type: 1, createdAt: -1 });
autopilotRecordSchema.index({ projectId: 1, fingerprint: 1, status: 1 });

export const AutopilotRecord = mongoose.model<AutopilotRecordDocument>(
  'AutopilotRecord',
  autopilotRecordSchema
);
