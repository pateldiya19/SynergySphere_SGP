import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { User as IUser } from '@/types';

export interface UserDocument extends Omit<IUser, '_id'>, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
  getPublicProfile(): Omit<UserDocument, 'password'>;
}

/** GitHub usernames are 1-39 chars of alphanumerics and single inner hyphens. */
export const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email address cannot exceed 254 characters'],
      // Linear-time pattern. The previous `([.-]?\w+)*` form had nested
      // quantifiers, so a crafted address submitted to /api/auth/register
      // could trigger catastrophic backtracking and stall the event loop.
      // Full RFC validation stays in express-validator's isEmail().
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please enter a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    /**
     * DEPRECATED, UNVERIFIED. A GitHub username the user typed in themselves.
     *
     * This must never drive a security decision. Anyone could type any
     * username here, so trusting it let a user claim a colleague's -- or a
     * stranger's -- commits as their own and have the proof-of-work panel
     * report the author as verified. Kept only so existing values can be
     * displayed as an unverified claim until the user links for real; see
     * `github` below, which is the verified identity.
     */
    githubLogin: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [39, 'GitHub username cannot exceed 39 characters'],
      match: [/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i, 'Please enter a valid GitHub username'],
    },

    /**
     * Verified GitHub identity, written only by the OAuth callback after GitHub
     * itself confirmed the account. This is the only GitHub identity any
     * verification logic is allowed to read.
     */
    github: {
      /**
       * GitHub's immutable numeric account id. Matching on this rather than on
       * the login is what makes verification hold up: a login can be renamed,
       * and a freed-up login can be taken over by someone else.
       */
      id: { type: Number },
      login: { type: String, trim: true, lowercase: true },
      avatarUrl: { type: String },
      linkedAt: { type: Date },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

// Index for performance
userSchema.index({ lastSeen: -1 });

// One GitHub account may back at most one SynergySphere account. Without this,
// two users could both link the same GitHub identity and both show as the
// verified author of the same commits. Sparse so unlinked users are exempt.
userSchema.index({ 'github.id': 1 }, { unique: true, sparse: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get public profile method
userSchema.methods.getPublicProfile = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

export const User = mongoose.model<UserDocument>('User', userSchema);
