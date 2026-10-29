import { Request, Response } from 'express';
import { config, isGitHubOAuthConfigured } from '@/config';
import { AuthenticatedRequest } from '@/middleware';
import { GitHubIdentityError, GitHubIdentityService } from '@/services/GitHubIdentityService';
import { logger, ResponseUtils } from '@/utils';

/**
 * Where the browser lands after a callback.
 *
 * Built from `config.FRONTEND_URL` and never from anything in the request. A
 * callback-supplied redirect target would be an open redirect, and this
 * endpoint is reachable without authentication, so it is a particularly bad
 * place to honour one.
 */
function settingsRedirect(params: Record<string, string>): string {
  const base = config.FRONTEND_URL.replace(/\/+$/, '');
  const query = new URLSearchParams(params).toString();
  return `${base}/settings?${query}`;
}

export class GitHubIdentityController {
  /** Report whether linking is available, so the UI can explain itself. */
  static async status(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user as any;
    const linked = user?.github?.id
      ? {
          login: user.github.login,
          avatarUrl: user.github.avatarUrl,
          linkedAt: user.github.linkedAt,
        }
      : null;

    ResponseUtils.success(
      res,
      {
        configured: isGitHubOAuthConfigured(),
        linked,
        // Surfaced so the UI can show it as an explicitly unverified claim
        // rather than silently discarding what the user typed previously.
        unverifiedClaim: user?.githubLogin || null,
      },
      'GitHub identity status retrieved successfully'
    );
  }

  /**
   * Start a link. Returns the URL instead of redirecting, because the SPA calls
   * this with its bearer token and a 302 would drop that header.
   */
  static async start(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const url = await GitHubIdentityService.createAuthorizationUrl(String(req.user._id));
      ResponseUtils.success(res, { url }, 'Authorization URL created successfully');
    } catch (error: any) {
      if (error instanceof GitHubIdentityError) {
        ResponseUtils.error(res, error.message, error.statusCode);
        return;
      }
      logger.error(`GitHub authorization URL failed: ${error.message}`);
      ResponseUtils.serverError(res, 'Could not start GitHub linking');
    }
  }

  /**
   * Handle GitHub's redirect back.
   *
   * Deliberately unauthenticated: the browser arrives straight from GitHub with
   * no bearer token. The account being linked therefore comes from the stored
   * `state` row, which is consumed atomically, and never from the query string.
   */
  static async callback(req: Request, res: Response): Promise<void> {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    // GitHub sends `error` when the user pressed Cancel on the consent screen.
    if (typeof req.query.error === 'string' && req.query.error) {
      res.redirect(settingsRedirect({ github: 'cancelled' }));
      return;
    }

    if (!code || !state) {
      res.redirect(
        settingsRedirect({ github: 'error', reason: 'GitHub did not return a valid response.' })
      );
      return;
    }

    // Consume state before touching GitHub, so a replayed callback is rejected
    // even if the exchange below would have succeeded.
    const userId = await GitHubIdentityService.consumeState(state);
    if (!userId) {
      logger.warn('GitHub callback rejected: unknown, expired or already-used state');
      res.redirect(
        settingsRedirect({
          github: 'error',
          reason: 'This linking request has expired or was already used. Please try again.',
        })
      );
      return;
    }

    try {
      const identity = await GitHubIdentityService.fetchIdentityForCode(code);
      await GitHubIdentityService.linkIdentity(userId, identity);
      res.redirect(settingsRedirect({ github: 'linked', login: identity.login }));
    } catch (error: any) {
      const message =
        error instanceof GitHubIdentityError
          ? error.message
          : 'GitHub linking failed. Please try again.';
      if (!(error instanceof GitHubIdentityError)) {
        logger.error(`GitHub callback failed: ${error.message}`);
      }
      res.redirect(settingsRedirect({ github: 'error', reason: message }));
    }
  }

  /** Remove the verified identity. */
  static async unlink(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await GitHubIdentityService.unlinkIdentity(String(req.user._id));
      ResponseUtils.success(res, null, 'GitHub account unlinked successfully');
    } catch (error: any) {
      logger.error(`GitHub unlink failed: ${error.message}`);
      ResponseUtils.serverError(res, 'Could not unlink the GitHub account');
    }
  }
}
