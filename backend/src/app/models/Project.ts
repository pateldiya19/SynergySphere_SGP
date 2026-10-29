import mongoose, { Document, Schema } from 'mongoose';
import { Project as IProject, ProjectMember } from '@/types';

export interface ProjectDocument extends Omit<IProject, '_id'>, Document {}

const projectMemberSchema = new Schema<any>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'manager', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const projectSchema = new Schema<any>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [projectMemberSchema],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    deadline: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    github: {
      owner: { type: String, trim: true, maxlength: 100 },
      name: { type: String, trim: true, maxlength: 100 },
      url: { type: String, trim: true, maxlength: 300 },
      repositoryId: { type: Number },
      // Stamped on each matched webhook delivery, so the project page can show
      // whether GitHub is really reaching this server -- "connected" otherwise
      // only means somebody typed a repository name into a form.
      lastDeliveryAt: { type: Date },
      lastDeliveryEvent: { type: String, trim: true, maxlength: 50 },
    },
    taskSequence: { type: Number, default: 0 },
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
projectSchema.index({ ownerId: 1 });
projectSchema.index({ 'members.userId': 1 });
projectSchema.index({ name: 'text', description: 'text' });
projectSchema.index({ createdAt: -1 });

// Ensure owner is always in members array
projectSchema.pre('save', function (this: any, next: any) {
  const uniqueMembers = new Map<string, ProjectMember>();
  for (const member of this.members || []) {
    const memberId = member.userId.toString();
    if (!uniqueMembers.has(memberId)) uniqueMembers.set(memberId, member);
  }

  const ownerId = this.ownerId.toString();
  const owner = uniqueMembers.get(ownerId);
  if (owner) {
    owner.role = 'owner';
  } else {
    uniqueMembers.set(ownerId, {
      userId: this.ownerId,
      role: 'owner',
      joinedAt: new Date(),
    });
  }

  this.members = Array.from(uniqueMembers.values());
  next();
});

export const Project = mongoose.model<ProjectDocument>('Project', projectSchema);
