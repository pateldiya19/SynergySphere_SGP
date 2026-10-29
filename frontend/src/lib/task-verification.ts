import { ApiTaskProof } from '@/lib/api'

export type VerificationCheckState = 'pass' | 'fail' | 'unknown'

export type VerificationCheck = {
  key: string
  label: string
  state: VerificationCheckState
  detail?: string
}

export type VerificationStatus = 'verified' | 'self_reported' | 'none'

export type TaskVerification = {
  /** Overall trust level of the evidence attached to the task. */
  status: VerificationStatus
  statusLabel: string
  /** The authoritative webhook-delivered proof, when one exists. */
  verifiedProof?: ApiTaskProof
  /** The best available proof for displaying checks and evidence details. */
  evidenceProof?: ApiTaskProof
  checks: VerificationCheck[]
  passedCount: number
  totalCount: number
}

/** True when the proof carries something a reviewer can actually inspect. */
export function proofHasEvidence(proof: ApiTaskProof): boolean {
  return Boolean(proof.url || proof.pullRequestNumber || proof.commits?.length)
}

export function isVerifiedProof(proof: ApiTaskProof): boolean {
  return proof.source === 'github' && proofHasEvidence(proof)
}

export function getCommitCount(proof: ApiTaskProof): number {
  return proof.commitCount ?? proof.commits?.length ?? 0
}

/**
 * Only GitHub can tell us whether a pull request is open, closed, or merged.
 * A self-reported link carries no state, so it stays "Unknown" rather than
 * implying a status the system has not confirmed.
 */
export function getPullRequestStateLabel(proof: ApiTaskProof): string {
  if (proof.source !== 'github') return 'Unknown'
  if (proof.state) return proof.state.charAt(0).toUpperCase() + proof.state.slice(1)
  if (proof.merged === true) return 'Merged'
  return 'Unknown'
}

/** Formats the project's connected repository as `owner/name`. */
export function formatProjectRepository(github?: {
  owner?: string
  name?: string
}): string | undefined {
  if (!github?.owner || !github?.name) return undefined
  return `${github.owner}/${github.name}`.toLowerCase()
}

/**
 * Build the Project Manager's verification summary for a task.
 *
 * Every check reports one of three states so the reviewer can tell a failed
 * check apart from one that simply cannot be determined yet (for example when
 * the developer has not linked a GitHub account).
 */
export function getTaskVerification(
  proofs: ApiTaskProof[] = [],
  projectRepository?: string
): TaskVerification {
  const githubProofs = proofs.filter(proof => proof.type === 'github')
  const verifiedProofs = githubProofs.filter(isVerifiedProof)
  // Prefer the most recently updated verified proof as the headline evidence.
  const verifiedProof = [...verifiedProofs].sort(
    (left, right) =>
      new Date(right.lastUpdatedAt || right.submittedAt).getTime() -
      new Date(left.lastUpdatedAt || left.submittedAt).getTime()
  )[0]

  const selfReported = githubProofs.filter(
    proof => !isVerifiedProof(proof) && proofHasEvidence(proof)
  )
  const status: VerificationStatus = verifiedProof
    ? 'verified'
    : selfReported.length
    ? 'self_reported'
    : 'none'
  const statusLabel =
    status === 'verified'
      ? 'Verified'
      : status === 'self_reported'
      ? 'Self-reported'
      : 'No evidence'

  const evidence = verifiedProof || selfReported[0]
  const commitCount = evidence ? getCommitCount(evidence) : 0
  const changedLines = (evidence?.additions ?? 0) + (evidence?.deletions ?? 0)
  const hasCodeChanges = Boolean(evidence && (changedLines > 0 || (evidence.filesChanged ?? 0) > 0))

  const repositoryCheck = ((): VerificationCheck => {
    const repository = evidence?.repository
    if (!repository) {
      return {
        key: 'repository',
        label: 'GitHub repository matches project',
        state: 'unknown',
        detail: 'Repository not recorded',
      }
    }
    if (!projectRepository) {
      return {
        key: 'repository',
        label: 'GitHub repository matches project',
        state: 'unknown',
        detail: 'Project repository not configured',
      }
    }
    if (repository.toLowerCase() !== projectRepository.toLowerCase()) {
      return {
        key: 'repository',
        label: 'GitHub repository matches project',
        state: 'fail',
        detail: `${repository} is not the connected repository`,
      }
    }
    return {
      key: 'repository',
      label: 'GitHub repository matches project',
      state: 'pass',
      detail: repository,
    }
  })()

  const authorCheck = ((): VerificationCheck => {
    if (!evidence?.pullRequestAuthor) {
      return {
        key: 'assignee_match',
        label: 'Developer matches assignee',
        state: 'unknown',
        detail: 'Not verified',
      }
    }
    if (evidence.authorMatchesAssignee === true) {
      return {
        key: 'assignee_match',
        label: 'Developer matches assignee',
        state: 'pass',
        detail: evidence.pullRequestAuthor,
      }
    }
    if (evidence.authorMatchesAssignee === false) {
      return {
        key: 'assignee_match',
        label: 'Developer matches assignee',
        state: 'fail',
        detail: `${evidence.pullRequestAuthor} is not the assignee`,
      }
    }
    return {
      key: 'assignee_match',
      label: 'Developer matches assignee',
      state: 'unknown',
      detail: 'GitHub account not linked',
    }
  })()

  const checks: VerificationCheck[] = [
    repositoryCheck,
    {
      key: 'pull_request',
      label: 'Pull request detected',
      state: evidence?.pullRequestNumber ? 'pass' : 'unknown',
      detail: evidence?.pullRequestNumber
        ? `#${evidence.pullRequestNumber}`
        : 'No pull request linked',
    },
    {
      key: 'commits',
      label: 'Commits detected',
      state: commitCount > 0 ? 'pass' : 'unknown',
      detail:
        commitCount > 0
          ? `${commitCount} ${commitCount === 1 ? 'commit' : 'commits'}`
          : 'No commits recorded',
    },
    {
      key: 'developer',
      label: 'Developer identified',
      state: evidence?.pullRequestAuthor ? 'pass' : 'unknown',
      detail: evidence?.pullRequestAuthor || 'Not verified',
    },
    authorCheck,
    {
      key: 'code_changes',
      label: 'Code changes detected',
      state: hasCodeChanges ? 'pass' : 'unknown',
      detail: hasCodeChanges
        ? `${evidence?.filesChanged ?? 0} ${
            (evidence?.filesChanged ?? 0) === 1 ? 'file' : 'files'
          }, +${evidence?.additions ?? 0} / -${evidence?.deletions ?? 0}`
        : 'No diff statistics recorded',
    },
    {
      key: 'webhook',
      label: 'Evidence received from GitHub webhook',
      state: verifiedProof ? 'pass' : 'fail',
      detail: verifiedProof ? 'Signed webhook delivery' : 'Not confirmed by GitHub',
    },
  ]

  return {
    status,
    statusLabel,
    verifiedProof,
    evidenceProof: evidence,
    checks,
    passedCount: checks.filter(check => check.state === 'pass').length,
    totalCount: checks.length,
  }
}
