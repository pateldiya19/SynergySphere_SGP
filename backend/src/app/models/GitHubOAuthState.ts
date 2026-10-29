import mongoose, { Document, Schema } from 'mongoose';

export interface GitHubOAuthStateDocument extends Document {
  state: string;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

/** A pending authorization is only useful for a few minutes. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * One pending GitHub authorization.
 *
 * The `state` parameter is what binds a callback to the user who actually
 * started the flow. Storing it server-side (rather than signing it and trusting
 * whatever comes back) gives two properties a stateless token cannot:
 *
 *  - single use: the row is deleted when consumed, so a leaked callback URL
 *    cannot be replayed to re-link an account;
 *  - server-side binding: the linked user comes from this row, never from the
 *    query string, so an attacker cannot aim someone else's authorization code
 *    at their own account.
 *
 * Rows expire on their own via the TTL index, so an abandoned flow leaves
 * nothing behind.
 */
const gitHubOAuthStateSchema = new Schema<GitHubOAuthStateDocument>(
  {
    state: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

gitHubOAuthStateSchema.index({ createdAt: 1 }, { expireAfterSeconds: OAUTH_STATE_TTL_SECONDS });

export const GitHubOAuthState = mongoose.model<GitHubOAuthStateDocument>(
  'GitHubOAuthState',
  gitHubOAuthStateSchema
);
