/**
 * Test environment defaults.
 *
 * Registered as a jest `setupFiles` entry so it runs *before* any test module
 * imports `@/config`, whose secret validation throws at import time.
 *
 * Without this, `npm test` only passed on a machine that happened to have a
 * populated `.env`: on CI, or on a fresh clone, every suite that touches the
 * config module failed with "Missing required environment variable". These
 * values are throwaway test fixtures and are deliberately strong enough to
 * satisfy the same validation that production secrets must pass -- weakening
 * the check for tests would defeat the point of having it.
 *
 * Real values in `.env` still win, so a developer's own setup is untouched.
 */
const testDefaults: Record<string, string> = {
  NODE_ENV: 'test',
  // Suites use mongodb-memory-server (see tests/setup.ts); this value only has
  // to exist so the config module's required-variable check passes.
  MONGODB_URI: 'mongodb://127.0.0.1:27017/synergysphere_test',
  JWT_SECRET: 'test-only-access-key-not-used-outside-jest-0123456789',
  JWT_REFRESH_SECRET: 'test-only-refresh-key-not-used-outside-jest-9876543210',
  GITHUB_WEBHOOK_SECRET: 'test-only-webhook-signing-key-not-used-outside-jest',
};

for (const [name, value] of Object.entries(testDefaults)) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}
