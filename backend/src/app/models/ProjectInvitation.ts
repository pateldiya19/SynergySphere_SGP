import mongoose, { Document, Schema } from 'mongoose';

export type ProjectInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface ProjectInvitationDocument extends Document {
  projectId: mongoose.Types.ObjectId;
  inviterId: mongoose.Types.ObjectId;
  inviteeId: mongoose.Types.ObjectId;
  status: ProjectInvitationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const projectInvitationSchema = new Schema<ProjectInvitationDocument>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    inviterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inviteeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

projectInvitationSchema.index({ projectId: 1, inviteeId: 1, status: 1 });
projectInvitationSchema.index({ inviteeId: 1, status: 1, createdAt: -1 });

export const ProjectInvitation = mongoose.model<ProjectInvitationDocument>(
  'ProjectInvitation',
  projectInvitationSchema
);
