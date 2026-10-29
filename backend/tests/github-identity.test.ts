import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { GitHubOAuthState, User } from '../src/app/models';

/**
 * Covers the GitHub identity link, whose whole purpose is that a user cannot
 * assert who they are on GitHub -- GitHub asserts it. The cases below are the
 * ways that guarantee could be broken: a forged callback, a replayed one, one
 * aimed at someone else's account, or two users claiming one GitHub account.
 */
describe('GitHub verified identity linking', () => {
  let app: Express;
  let aliceToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const GITHUB_ID = 135790;
  const GITHUB_LOGIN = 'octo-dev';

  const originalFetch = global.fetch;

  beforeAll(() => {
    config.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
    config.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret-long-enough-to-pass-validation';
    config.GITHUB_OAUTH_CALLBACK_URL = 'http://localhost:5000/api/auth/github/callback';
    config.FRONTEND_URL = 'http://localhost:5173';
    app = createApp() as Express;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  /**
   * Stand in for GitHub's token exchange and `GET /user`.
   *
   * Stubbed at the `fetch` boundary so the flow under test is the real one:
   * the controller, the state store and the service all run unmodified.
   */
  function stubGitHub(profile: { id: number; login: string } | null, tokenError?: string) {
    global.fetch = jest.fn(async (url: any) => {
      const target = String(url);
      if (target.includes('login/oauth/access_token')) {
        return {
          ok: true,
          json: async () =>
            tokenError
              ? { error: tokenError, error_description: tokenError }
              : { access_token: 'gho_test' },
        } as any;
      }
      if (target.includes('api.github.com/user')) {
        return {
          ok: profile !== null,
          status: profile === null ? 401 : 200,
          json: async () => ({ ...profile, avatar_url: 'https://avatars.example/u.png' }),
        } as any;
      }
      throw new Error(`unexpected fetch to ${target}`);
    }) as any;
  }

  beforeEach(async () => {
    await User.deleteMany({});
    await GitHubOAuthState.deleteMany({});

    const register = async (name: string, email: string) =>
      request(app)
        .post('/api/auth/register')
        .send({ name, email, password: 'password123' })
        .expect(201);

    const alice = await register('Alice Dev', 'alice@example.com');
    const bob = await register('Bob Dev', 'bob@example.com');
    aliceToken = alice.body.data.accessToken;
    aliceId = String(alice.body.data.user.id || alice.body.data.user._id);
    bobToken = bob.body.data.accessToken;
    bobId = String(bob.body.data.user.id || bob.body.data.user._id);
  });

  /** Start a flow and return the `state` the server minted for that user. */
  async function startFlow(token: string): Promise<string> {
    const response = await request(app).post('/api/auth/github/start').set(auth(token)).expect(200);
    const url = new URL(response.body.data.url);
    return url.searchParams.get('state') as string;
  }

  describe('starting a link', () => {
    it('requires authentication', async () => {
      await request(app).post('/api/auth/github/start').expect(401);
    });

    it('returns an authorize URL carrying the configured client and callback', async () => {
      const response = await request(app)
        .post('/api/auth/github/start')
        .set(auth(aliceToken))
        .expect(200);

      const url = new URL(response.body.data.url);
      expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(config.GITHUB_OAUTH_CALLBACK_URL);
      expect(url.searchParams.get('state')).toHaveLength(43);
      // No scopes: identity verification only needs the public profile.
      expect(url.searchParams.get('scope')).toBe('');
    });

    it('binds the pending state to the user who started it', async () => {
      const state = await startFlow(aliceToken);
      const stored = await GitHubOAuthState.findOne({ state }).lean<any>();
      expect(String(stored.userId)).toBe(aliceId);
    });
  });

  describe('completing a link', () => {
    it('stores the identity GitHub confirmed, against the user who started the flow', async () => {
      const state = await startFlow(aliceToken);
      stubGitHub({ id: GITHUB_ID, login: 'Octo-Dev' });

      const response = await request(app)
        .get(`/api/auth/github/callback?code=abc123&state=${state}`)
        .expect(302);
      expect(response.headers.location).toBe(
        `http://localhost:5173/settings?github=linked&login=${GITHUB_LOGIN}`
      );

      const alice = await User.findById(aliceId).lean<any>();
      expect(alice.github).toMatchObject({ id: GITHUB_ID, login: GITHUB_LOGIN });
      expect(alice.github.linkedAt).toBeInstanceOf(Date);
    });

    it('clears a legacy self-declared username once a verified identity exists', async () => {
      await User.findByIdAndUpdate(aliceId, { $set: { githubLogin: 'some-claim' } });
      const state = await startFlow(aliceToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });

      await request(app).get(`/api/auth/github/callback?code=abc123&state=${state}`).expect(302);

      const alice = await User.findById(aliceId).lean<any>();
      expect(alice.githubLogin).toBeUndefined();
    });

    it('consumes the state so a captured callback cannot be replayed', async () => {
      const state = await startFlow(aliceToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });
      await request(app).get(`/api/auth/github/callback?code=abc123&state=${state}`).expect(302);

      await User.findByIdAndUpdate(aliceId, { $unset: { github: 1 } });
      const replay = await request(app)
        .get(`/api/auth/github/callback?code=abc123&state=${state}`)
        .expect(302);

      expect(replay.headers.location).toContain('github=error');
      expect(replay.headers.location).toMatch(/expired|already/i);
      const alice = await User.findById(aliceId).lean<any>();
      expect(alice.github?.id).toBeUndefined();
    });

    it('rejects a fabricated state and links nothing', async () => {
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });
      const response = await request(app)
        .get('/api/auth/github/callback?code=abc123&state=not-a-real-state')
        .expect(302);

      expect(response.headers.location).toContain('github=error');
      expect(await User.findOne({ 'github.id': GITHUB_ID }).lean()).toBeNull();
      // The code is never exchanged, so GitHub is not contacted at all.
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refuses to link one GitHub account to a second user', async () => {
      const aliceState = await startFlow(aliceToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });
      await request(app).get(`/api/auth/github/callback?code=a&state=${aliceState}`).expect(302);

      const bobState = await startFlow(bobToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });
      const response = await request(app)
        .get(`/api/auth/github/callback?code=b&state=${bobState}`)
        .expect(302);

      expect(response.headers.location).toContain('github=error');
      expect(response.headers.location).toMatch(/already%20linked|already\+linked/i);
      const bob = await User.findById(bobId).lean<any>();
      expect(bob.github?.id).toBeUndefined();
      // Alice keeps hers.
      const alice = await User.findById(aliceId).lean<any>();
      expect(alice.github.id).toBe(GITHUB_ID);
    });

    it('reports a cancelled consent screen without an error', async () => {
      const response = await request(app)
        .get('/api/auth/github/callback?error=access_denied')
        .expect(302);
      expect(response.headers.location).toBe('http://localhost:5173/settings?github=cancelled');
    });

    it('surfaces a declined authorization instead of linking', async () => {
      const state = await startFlow(aliceToken);
      stubGitHub(null, 'bad_verification_code');

      const response = await request(app)
        .get(`/api/auth/github/callback?code=stale&state=${state}`)
        .expect(302);
      expect(response.headers.location).toContain('github=error');
      const alice = await User.findById(aliceId).lean<any>();
      expect(alice.github?.id).toBeUndefined();
    });

    it('ignores a caller-supplied redirect target', async () => {
      const state = await startFlow(aliceToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });

      const response = await request(app)
        .get(
          `/api/auth/github/callback?code=abc&state=${state}` +
            '&redirect_uri=https://attacker.example/steal'
        )
        .expect(302);

      // The endpoint is unauthenticated, so honouring a supplied target would
      // be an open redirect. It must always land on the configured frontend.
      expect(response.headers.location.startsWith('http://localhost:5173/settings?')).toBe(true);
      expect(response.headers.location).not.toContain('attacker.example');
    });
  });

  describe('status and unlinking', () => {
    it('reports an unlinked account and any legacy claim as unverified', async () => {
      await User.findByIdAndUpdate(aliceId, { $set: { githubLogin: 'typed-by-hand' } });
      const response = await request(app)
        .get('/api/auth/github/status')
        .set(auth(aliceToken))
        .expect(200);

      expect(response.body.data).toMatchObject({
        configured: true,
        linked: null,
        unverifiedClaim: 'typed-by-hand',
      });
    });

    it('removes the verified identity on unlink', async () => {
      const state = await startFlow(aliceToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });
      await request(app).get(`/api/auth/github/callback?code=abc&state=${state}`).expect(302);

      await request(app).delete('/api/auth/github/link').set(auth(aliceToken)).expect(200);

      const alice = await User.findById(aliceId).lean<any>();
      expect(alice.github?.id).toBeUndefined();
      // Freed up, so the account can be linked elsewhere afterwards.
      const bobState = await startFlow(bobToken);
      stubGitHub({ id: GITHUB_ID, login: GITHUB_LOGIN });
      await request(app).get(`/api/auth/github/callback?code=def&state=${bobState}`).expect(302);
      expect((await User.findById(bobId).lean<any>()).github.id).toBe(GITHUB_ID);
    });

    it('requires authentication to unlink', async () => {
      await request(app).delete('/api/auth/github/link').expect(401);
    });
  });
});
