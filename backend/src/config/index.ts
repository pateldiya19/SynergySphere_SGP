import dotenv from 'dotenv';

dotenv.config();

const requiredEnvironmentVariables = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

for (const variableName of requiredEnvironmentVariables) {
  if (!process.env[variableName]) {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }
}

/**
 * Substrings that appear in the committed `.env.example` and in the usual
 * copy-paste templates. A secret containing one of these is public knowledge,
 * so anyone can forge the tokens or webhook signatures it protects.
 */
const PLACEHOLDER_MARKERS = [
  'your-',
  'your_',
  'changeme',
  'change-me',
  'change this',
  'change-this',
  'placeholder',
  'replace-with',
  'replace_with',
  'super-secret',
  'example-secret',
  'todo',
];

/** HMAC keys shorter than this are brute-forceable; 32 bytes is the usual floor. */
const MINIMUM_SECRET_LENGTH = 32;

const HOW_TO_GENERATE =
  "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"";

/**
 * Reject a secret that is a known template value or too short to be a real key.
 *
 * This runs at import time so the process refuses to start rather than coming
 * up and signing sessions with a value published in the repository. Failing
 * loudly here is the whole point: a silent fallback is what turns a forgotten
 * placeholder into an authentication bypass.
 */
function assertStrongSecret(name: string, value: string): void {
  const normalized = value.trim().toLowerCase();
  const marker = PLACEHOLDER_MARKERS.find(candidate => normalized.includes(candidate));

  if (marker) {
    throw new Error(
      `${name} is still set to a placeholder value (contains "${marker}"). ` +
        `Anyone reading .env.example knows it. ${HOW_TO_GENERATE}`
    );
  }

  if (value.trim().length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MINIMUM_SECRET_LENGTH} characters; got ${value.trim().length}. ` +
        HOW_TO_GENERATE
    );
  }
}

assertStrongSecret('JWT_SECRET', process.env.JWT_SECRET!);
assertStrongSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET!);

if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error(
    'JWT_SECRET and JWT_REFRESH_SECRET must differ, otherwise a stolen access token ' +
      'can be replayed as a refresh token. ' +
      HOW_TO_GENERATE
  );
}

/**
 * Reject a connection string that names no database.
 *
 * MongoDB silently falls back to a database called `test` in that case, so the
 * app comes up healthy while reading and writing an entirely empty dataset --
 * which is exactly how a working `.env` can look broken ("my seeded users
 * disappeared"). Checked here rather than at connect time so the failure names
 * the cause instead of surfacing as missing data later.
 */
function assertNamesDatabase(name: string, uri: string): void {
  const withoutQuery = uri.split('?')[0];
  // Strip the scheme first: `mongodb://` contributes slashes of its own, and a
  // URI without credentials has no `@` to anchor on.
  const afterScheme = withoutQuery.slice(withoutQuery.indexOf('://') + 3);
  const afterCredentials = afterScheme.slice(afterScheme.indexOf('@') + 1);
  const separator = afterCredentials.indexOf('/');
  const database = separator === -1 ? '' : afterCredentials.slice(separator + 1);

  if (!database) {
    throw new Error(
      `${name} does not name a database, so MongoDB would silently use "test" ` +
        'and the app would read an empty dataset. Append the database to the host ' +
        'list, e.g. mongodb://<host>/synergysphere?<options>'
    );
  }
}

assertNamesDatabase('MONGODB_URI', process.env.MONGODB_URI!);

// The webhook secret is optional: leaving it unset disables GitHub proof-of-work
// ingestion (GitHubController rejects every unsigned delivery). But a weak value
// is worse than none, because it makes forged commit evidence verify.
if (process.env.GITHUB_WEBHOOK_SECRET) {
  assertStrongSecret('GITHUB_WEBHOOK_SECRET', process.env.GITHUB_WEBHOOK_SECRET);
}

// GitHub OAuth is optional and all three values are needed together: with any
// of them missing, identity linking reports itself as unconfigured (503) rather
// than half-working. The client secret is a real credential, so it is held to
// the same strength check as the signing secrets -- GitHub issues 40-character
// secrets, so a short value here means someone pasted a placeholder.
const githubOAuthValues = [
  process.env.GITHUB_OAUTH_CLIENT_ID,
  process.env.GITHUB_OAUTH_CLIENT_SECRET,
];

if (githubOAuthValues.some(Boolean)) {
  if (!githubOAuthValues.every(Boolean)) {
    throw new Error(
      'GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET must both be set, or both be ' +
        'left unset to disable GitHub identity linking. Only one is currently set.'
    );
  }
  assertStrongSecret('GITHUB_OAUTH_CLIENT_SECRET', process.env.GITHUB_OAUTH_CLIENT_SECRET!);
}

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI: process.env.MONGODB_URI!,
  MONGODB_TEST_URI: process.env.MONGODB_TEST_URI || process.env.MONGODB_URI!,
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Email is optional: with SMTP unset the app runs normally and invitations
  // and review requests stay in-app only.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_EMAIL: process.env.SMTP_EMAIL || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'SynergySphere',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  RATE_LIMIT_WINDOW: Number(process.env.RATE_LIMIT_WINDOW || 15),
  RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'logs/app.log',
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || '',
  GITHUB_WEBHOOK_URL:
    process.env.GITHUB_WEBHOOK_URL ||
    `http://localhost:${process.env.PORT || 5000}/api/github/webhook`,
  GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID || '',
  GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET || '',
  // Must byte-for-byte match the "Authorization callback URL" on the GitHub
  // OAuth App, otherwise GitHub refuses the exchange.
  GITHUB_OAUTH_CALLBACK_URL:
    process.env.GITHUB_OAUTH_CALLBACK_URL ||
    `http://localhost:${process.env.PORT || 5000}/api/auth/github/callback`,
};

/** Whether GitHub identity linking is configured and therefore available. */
export const isGitHubOAuthConfigured = (): boolean =>
  Boolean(config.GITHUB_OAUTH_CLIENT_ID && config.GITHUB_OAUTH_CLIENT_SECRET);

/** Whether outbound email is configured. When false, email is simply skipped. */
export const isEmailConfigured = (): boolean =>
  Boolean(config.SMTP_HOST && config.SMTP_EMAIL && config.SMTP_PASSWORD);
