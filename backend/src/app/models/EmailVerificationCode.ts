import mongoose, { Document, Schema } from 'mongoose';

export interface EmailVerificationCodeDocument extends Document {
  email: string;
  codeHash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const emailVerificationCodeSchema = new Schema<EmailVerificationCodeDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    resendAvailableAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

emailVerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationCode = mongoose.model<EmailVerificationCodeDocument>(
  'EmailVerificationCode',
  emailVerificationCodeSchema
);
