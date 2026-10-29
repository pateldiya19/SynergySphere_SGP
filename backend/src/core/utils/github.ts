/**
 * Shared helpers for reading GitHub repository coordinates out of the strings
 * users and webhooks give us. Used by project repository binding and by proof
 * submission, so a pasted URL is checked against the same normalization the
 * project was saved with.
 */

export type GitHubRepositoryRef = {
  owner: string;
  name: string;
};

export type ParsedGitHubEvidenceUrl = GitHubRepositoryRef & {
  kind: 'pull' | 'commit';
  pullRequestNumber?: number;
  sha?: string;
};

/**
 * Accepts either a bare repository name or a full repository URL and returns
 * the lowercase repository name.
 */
export function normalizeGitHubRepositoryName(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/[^/]+\/([^/?#]+?)(?:\.git)?\/?$/i);
  return (urlMatch?.[1] || trimmed.replace(/\.git$/i, '')).toLowerCase();
}

/** `owner/name` in the same lowercase form the webhook and project binding use. */
export function formatRepositoryFullName(owner: string, name: string): string {
  return `${owner.trim().toLowerCase()}/${normalizeGitHubRepositoryName(name)}`;
}

/**
 * Pull `owner` and `name` out of whatever the user actually typed.
 *
 * People paste the repository URL, or `owner/name`, or the SSH clone string,
 * and they do it into whichever box the cursor happens to be in. Accepting only
 * a bare owner and a bare name is how a project ends up bound to a repository
 * named "https://github.com/someone/thing.git", which no webhook will ever
 * match -- the binding looks fine in the UI and silently never fires.
 *
 * Returns null when neither field yields a usable pair.
 */
export function parseRepositoryInput(
  ownerInput: unknown,
  nameInput: unknown
): GitHubRepositoryRef | null {
  const owner = typeof ownerInput === 'string' ? ownerInput.trim() : '';
  const name = typeof nameInput === 'string' ? nameInput.trim() : '';

  // A full reference in either box wins: it carries both halves.
  for (const candidate of [owner, name]) {
    const pair = parseRepositoryReference(candidate);
    if (pair) return pair;
  }

  if (owner && name) {
    return { owner: owner.toLowerCase(), name: normalizeGitHubRepositoryName(name) };
  }

  return null;
}

/** Parse `owner/name`, a github.com URL, or an SSH clone string. */
function parseRepositoryReference(value: string): GitHubRepositoryRef | null {
  if (!value) return null;

  // Strip the parts that only wrap the owner/name pair, then match once. Doing
  // it in steps keeps every pattern linear-time: a single combined pattern with
  // optional prefixes and suffixes backtracks badly on long inputs.
  let remainder = value;

  remainder = remainder.replace(/^git@github\.com:/i, '');
  remainder = remainder.replace(/^https?:\/\//i, '');
  remainder = remainder.replace(/^www\./i, '');
  remainder = remainder.replace(/^github\.com\//i, '');

  // Drop any query string or fragment, then a trailing slash and .git suffix.
  remainder = remainder.split(/[?#]/)[0];
  remainder = remainder.replace(/\/+$/, '');
  remainder = remainder.replace(/\.git$/i, '');

  const parts = remainder.split('/');
  if (parts.length !== 2) return null;

  const [owner, name] = parts;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(owner)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return null;

  return { owner: owner.toLowerCase(), name: name.toLowerCase() };
}

/**
 * Parse a pull request or commit URL into its repository coordinates.
 * Returns null for anything that is not a github.com PR/commit link.
 */
export function parseGitHubEvidenceUrl(value: string): ParsedGitHubEvidenceUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.hostname.toLowerCase() !== 'github.com') return null;

  // /:owner/:repo/(pull|commit|commits)/:ref
  const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|commit|commits)\/([^/?#]+)/i);
  if (!match) return null;

  const [, owner, repository, segment, ref] = match;
  const kind = segment.toLowerCase() === 'pull' ? 'pull' : 'commit';

  if (kind === 'pull') {
    const pullRequestNumber = Number(ref);
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) return null;
    return {
      owner: owner.toLowerCase(),
      name: normalizeGitHubRepositoryName(repository),
      kind,
      pullRequestNumber,
    };
  }

  if (!/^[0-9a-f]{7,40}$/i.test(ref)) return null;
  return {
    owner: owner.toLowerCase(),
    name: normalizeGitHubRepositoryName(repository),
    kind,
    sha: ref.toLowerCase(),
  };
}

/**
 * True when a project has enough GitHub configuration to anchor proof against.
 * Mirrors the shapes the webhook matches on (owner+name, or a repository url).
 */
export function resolveProjectRepository(github: any): GitHubRepositoryRef | null {
  if (!github) return null;

  const owner = typeof github.owner === 'string' ? github.owner.trim().toLowerCase() : '';
  const rawName = typeof github.name === 'string' ? github.name.trim() : '';

  if (owner && rawName) {
    return { owner, name: normalizeGitHubRepositoryName(rawName) };
  }

  // Fall back to the stored repository URL for projects bound before owner/name
  // were split out.
  if (typeof github.url === 'string' && github.url.trim()) {
    const match = github.url
      .trim()
      .match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
    if (match) {
      return { owner: match[1].toLowerCase(), name: normalizeGitHubRepositoryName(match[2]) };
    }
  }

  return null;
}

/** Case-insensitive repository equality. */
export function repositoriesMatch(left: GitHubRepositoryRef, right: GitHubRepositoryRef): boolean {
  return left.owner === right.owner && left.name === right.name;
}
