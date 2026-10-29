import { describe, expect, it } from 'vitest'
import { ApiTaskProof } from '@/lib/api'
import {
  formatProjectRepository,
  getCommitCount,
  getPullRequestStateLabel,
  getTaskVerification,
  isVerifiedProof,
  proofHasEvidence,
} from '@/lib/task-verification'

const webhookProof: ApiTaskProof = {
  id: 'verified',
  type: 'github',
  source: 'github',
  submittedAt: '2026-10-05T09:00:00.000Z',
  lastUpdatedAt: '2026-10-05T12:00:00.000Z',
  repository: 'acme/app',
  branch: 'TASK-1-feature',
  pullRequestNumber: 42,
  pullRequestAuthor: 'dev-account',
  authorMatchesAssignee: true,
  state: 'open',
  commitCount: 5,
  filesChanged: 8,
  additions: 245,
  deletions: 31,
}

const selfReportedProof: ApiTaskProof = {
  id: 'self',
  type: 'github',
  source: 'user',
  submittedAt: '2026-10-05T09:00:00.000Z',
  repository: 'acme/app',
  url: 'https://github.com/acme/app/pull/7',
  pullRequestNumber: 7,
}

describe('proof helpers', () => {
  it('treats a proof as evidence when it carries a URL, pull request, or commits', () => {
    expect(proofHasEvidence(webhookProof)).toBe(true)
    expect(proofHasEvidence({ id: 'x', type: 'github', source: 'github', submittedAt: '' })).toBe(
      false
    )
    expect(
      proofHasEvidence({
        id: 'x',
        type: 'github',
        source: 'github',
        submittedAt: '',
        commits: [{ sha: 'abc' }],
      })
    ).toBe(true)
  })

  it('only treats webhook-sourced evidence as verified', () => {
    expect(isVerifiedProof(webhookProof)).toBe(true)
    expect(isVerifiedProof(selfReportedProof)).toBe(false)
  })

  it('falls back to the commit list when no commit count was reported', () => {
    expect(getCommitCount(webhookProof)).toBe(5)
    expect(
      getCommitCount({
        ...webhookProof,
        commitCount: undefined,
        commits: [{ sha: 'a' }, { sha: 'b' }],
      })
    ).toBe(2)
    expect(getCommitCount({ ...webhookProof, commitCount: undefined, commits: undefined })).toBe(0)
  })

  it('labels pull request state from the recorded state, then merge flag', () => {
    expect(getPullRequestStateLabel(webhookProof)).toBe('Open')
    expect(getPullRequestStateLabel({ ...webhookProof, state: 'merged' })).toBe('Merged')
    expect(getPullRequestStateLabel({ ...webhookProof, state: 'closed' })).toBe('Closed')
    expect(getPullRequestStateLabel({ ...webhookProof, state: undefined, merged: true })).toBe(
      'Merged'
    )
    expect(getPullRequestStateLabel({ ...webhookProof, state: undefined, merged: false })).toBe(
      'Unknown'
    )
    // A self-reported link carries no confirmed state, even with a PR number.
    expect(getPullRequestStateLabel({ ...selfReportedProof, merged: false })).toBe('Unknown')
  })

  it('formats a project repository only when both parts are known', () => {
    expect(formatProjectRepository({ owner: 'Acme', name: 'App' })).toBe('acme/app')
    expect(formatProjectRepository({ owner: 'acme' })).toBeUndefined()
    expect(formatProjectRepository(undefined)).toBeUndefined()
  })
})

describe('task verification summary', () => {
  it('reports every check passing for complete webhook evidence', () => {
    const verification = getTaskVerification([webhookProof], 'acme/app')

    expect(verification.status).toBe('verified')
    expect(verification.statusLabel).toBe('Verified')
    expect(verification.verifiedProof?.id).toBe('verified')
    expect(verification.passedCount).toBe(7)
    expect(verification.totalCount).toBe(7)
    expect(verification.checks.every(check => check.state === 'pass')).toBe(true)
  })

  it('marks a task with no evidence as having none and fails the webhook check', () => {
    const verification = getTaskVerification([], 'acme/app')

    expect(verification.status).toBe('none')
    expect(verification.statusLabel).toBe('No evidence')
    expect(verification.verifiedProof).toBeUndefined()
    expect(verification.checks.find(check => check.key === 'webhook')?.state).toBe('fail')
    expect(verification.passedCount).toBe(0)
  })

  it('classifies a manually submitted link as self-reported and not webhook verified', () => {
    const verification = getTaskVerification([selfReportedProof], 'acme/app')

    expect(verification.status).toBe('self_reported')
    expect(verification.statusLabel).toBe('Self-reported')
    expect(verification.verifiedProof).toBeUndefined()
    expect(verification.checks.find(check => check.key === 'webhook')).toMatchObject({
      state: 'fail',
      detail: 'Not confirmed by GitHub',
    })
    // The link still demonstrates a repository and a pull request.
    expect(verification.checks.find(check => check.key === 'repository')?.state).toBe('pass')
    expect(verification.checks.find(check => check.key === 'pull_request')?.state).toBe('pass')
  })

  it('prefers verified evidence over a self-reported entry on the same task', () => {
    const verification = getTaskVerification([selfReportedProof, webhookProof], 'acme/app')

    expect(verification.status).toBe('verified')
    expect(verification.verifiedProof?.id).toBe('verified')
  })

  it('fails the repository check when evidence comes from another repository', () => {
    const verification = getTaskVerification(
      [{ ...webhookProof, repository: 'facebook/react' }],
      'acme/app'
    )

    expect(verification.checks.find(check => check.key === 'repository')).toMatchObject({
      state: 'fail',
      detail: 'facebook/react is not the connected repository',
    })
    expect(verification.passedCount).toBe(6)
  })

  it('separates an author mismatch from an unresolvable author', () => {
    const mismatch = getTaskVerification(
      [{ ...webhookProof, authorMatchesAssignee: false }],
      'acme/app'
    )
    expect(mismatch.checks.find(check => check.key === 'assignee_match')).toMatchObject({
      state: 'fail',
      detail: 'dev-account is not the assignee',
    })

    const unlinked = getTaskVerification(
      [{ ...webhookProof, authorMatchesAssignee: undefined }],
      'acme/app'
    )
    expect(unlinked.checks.find(check => check.key === 'assignee_match')).toMatchObject({
      state: 'unknown',
      detail: 'GitHub account not linked',
    })

    const noAuthor = getTaskVerification(
      [{ ...webhookProof, pullRequestAuthor: undefined }],
      'acme/app'
    )
    expect(noAuthor.checks.find(check => check.key === 'assignee_match')).toMatchObject({
      state: 'unknown',
      detail: 'Not verified',
    })
    expect(noAuthor.checks.find(check => check.key === 'developer')).toMatchObject({
      state: 'unknown',
    })
  })

  it('does not claim a repository match when the project repository is unknown', () => {
    const verification = getTaskVerification([webhookProof])

    expect(verification.checks.find(check => check.key === 'repository')).toMatchObject({
      state: 'unknown',
      detail: 'Project repository not configured',
    })
  })

  it('treats commit-only evidence as verified without a pull request', () => {
    const verification = getTaskVerification(
      [
        {
          id: 'commits-only',
          type: 'github',
          source: 'github',
          submittedAt: '2026-10-05T09:00:00.000Z',
          repository: 'acme/app',
          branch: 'TASK-1-feature',
          commits: [{ sha: 'abc1234', message: 'TASK-1 implement' }],
          commitCount: 1,
        },
      ],
      'acme/app'
    )

    expect(verification.status).toBe('verified')
    expect(verification.checks.find(check => check.key === 'commits')?.state).toBe('pass')
    expect(verification.checks.find(check => check.key === 'pull_request')?.state).toBe('unknown')
    expect(verification.checks.find(check => check.key === 'code_changes')?.state).toBe('unknown')
    expect(verification.checks.find(check => check.key === 'webhook')?.state).toBe('pass')
  })

  it('ignores non-GitHub proof types when summarising verification', () => {
    const verification = getTaskVerification(
      [
        {
          id: 'notes',
          type: 'developer_notes',
          source: 'user',
          submittedAt: '2026-10-05T09:00:00.000Z',
          notes: 'Done',
        },
        {
          id: 'demo',
          type: 'demo_url',
          source: 'user',
          submittedAt: '2026-10-05T09:00:00.000Z',
          url: 'https://demo.example.com',
        },
      ],
      'acme/app'
    )

    expect(verification.status).toBe('none')
  })
})
