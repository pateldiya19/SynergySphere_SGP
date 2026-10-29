import crypto from 'crypto';
import { config, isGitHubOAuthConfigured } from '@/config';
import { GitHubOAuthState, User } from '@/models';
import { logger } from '@/utils';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

/** Abandon a GitHub call rather than hanging a request on it. */
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

export type VerifiedGitHubIdentity = {
  id: number;
  login: string;
  avatarUrl?: string;
  linkedAt: Date;
};

/** Raised for conditions the user can act on; the message is shown to them. */
export class GitHubIdentityError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'GitHubIdentityError';
  }
}

function assertConfigured(): void {
  if (!isGitHubOAuthConfigured()) {
    throw new GitHubIdentityError(
      'GitHub identity linking is not configured on this server. Set GITHUB_OAUTH_CLIENT_ID ' +
        'and GITHUB_OAUTH_CLIENT_SECRET to enable it.',
      503
    );
  }
}

async function postToGitHub(url: string, body: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new GitHubIdentityError(`GitHub rejected the request (HTTP ${response.status}).`, 502);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getFromGitHub(url: string, accessToken: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SynergySphere',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new GitHubIdentityError(
        `GitHub could not confirm the account (HTTP ${response.status}).`,
        502
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export class GitHubIdentityService {
  /**
   * Begin a link. Returns the GitHub URL to send the user to.
   *
   * No scopes are requested: `GET /user` returns the id, login and avatar of
   * the authenticated account without any, and those three fields are all that
   * identity verification needs. Asking for less than we could is deliberate --
   * a token that cannot read repositories or act on the user's behalf is not
   * worth stealing.
   */
  static async createAuthorizationUrl(userId: string): Promise<string> {
    assertConfigured();

    // 32 bytes from a CSPRNG: unguessable, so a third party cannot fabricate a
    // callback that passes state validation.
    const state = crypto.randomBytes(32).toString('base64url');
    await GitHubOAuthState.create({ state, userId });

    const params = new URLSearchParams({
      client_id: config.GITHUB_OAUTH_CLIENT_ID,
      redirect_uri: config.GITHUB_OAUTH_CALLBACK_URL,
      state,
      scope: '',
      allow_signup: 'false',
    });
    return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Consume a `state` value, returning the id of the user who started the flow.
   *
   * `findOneAndDelete` makes this atomic: two concurrent callbacks carrying the
   * same state cannot both succeed, so a captured callback URL is single-use.
   */
  static async consumeState(state: string): Promise<string | null> {
    if (!state) return null;
    const record = await GitHubOAuthState.findOneAndDelete({ state });
    return record ? String(record.userId) : null;
  }

  /**
   * Exchange an authorization code for the GitHub account behind it.
   *
   * The access token is used once, here, and then dropped: SynergySphere needs
   * to know *who* the user is, not to keep acting as them. Never persist it --
   * a stored token is a standing liability for a feature that does not use one.
   */
  static async fetchIdentityForCode(code: string): Promise<VerifiedGitHubIdentity> {
    assertConfigured();

    const tokenResponse = await postToGitHub(GITHUB_TOKEN_URL, {
      client_id: config.GITHUB_OAUTH_CLIENT_ID,
      client_secret: config.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: config.GITHUB_OAUTH_CALLBACK_URL,
    });

    if (tokenResponse?.error) {
      // `error_description` is GitHub's own copy and is safe to surface; the
      // code itself is already spent at this point.
      throw new GitHubIdentityError(
        `GitHub declined the authorization: ${String(
          tokenResponse.error_description || tokenResponse.error
        ).slice(0, 200)}`,
        400
      );
    }

    const accessToken = tokenResponse?.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new GitHubIdentityError('GitHub did not return an access token.', 502);
    }

    const profile = await getFromGitHub(GITHUB_USER_URL, accessToken);
    const id = Number(profile?.id);
    const login = typeof profile?.login === 'string' ? profile.login.toLowerCase() : '';

    if (!Number.isInteger(id) || id <= 0 || !login) {
      throw new GitHubIdentityError('GitHub returned an account without a usable id.', 502);
    }

    return {
      id,
      login,
      avatarUrl: typeof profile?.avatar_url === 'string' ? profile.avatar_url : undefined,
      linkedAt: new Date(),
    };
  }

  /**
   * Attach a verified identity to a user.
   *
   * Also clears the legacy self-declared `githubLogin`: once a real identity
   * exists there is no reason to keep an unverified claim around, and leaving
   * both would invite reading the wrong one.
   */
  static async linkIdentity(userId: string, identity: VerifiedGitHubIdentity): Promise<void> {
    const alreadyLinked = await User.findOne({ 'github.id': identity.id })
      .select('_id')
      .lean<{ _id: unknown } | null>();

    if (alreadyLinked && String(alreadyLinked._id) !== String(userId)) {
      throw new GitHubIdentityError(
        `The GitHub account @${identity.login} is already linked to another SynergySphere user. ` +
          'Unlink it there first.',
        409
      );
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { github: identity }, $unset: { githubLogin: 1 } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new GitHubIdentityError('The account to link no longer exists.', 404);
    }

    logger.info(
      `GitHub identity linked: user=${userId} githubId=${identity.id} login=${identity.login}`
    );
  }

  /** Detach the verified identity, which makes author checks indeterminate again. */
  static async unlinkIdentity(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $unset: { github: 1, githubLogin: 1 } });
    logger.info(`GitHub identity unlinked: user=${userId}`);
  }
}
