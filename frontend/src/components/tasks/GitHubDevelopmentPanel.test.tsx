import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GitHubDevelopmentPanel } from '@/components/tasks/GitHubDevelopmentPanel'
import { ApiTaskProof } from '@/lib/api'

const verifiedProof: ApiTaskProof = {
  id: 'proof-1',
  type: 'github',
  source: 'github',
  submittedAt: '2026-10-05T00:00:00.000Z',
  lastUpdatedAt: '2026-10-05T10:30:00.000Z',
  repository: 'acme/app',
  branch: 'TASK-123-customer-search',
  commitCount: 4,
  pullRequestNumber: 42,
  pullRequestTitle: 'Implement customer search',
  pullRequestAuthor: 'Rahul',
  authorMatchesAssignee: true,
  state: 'open',
  filesChanged: 8,
  additions: 342,
  deletions: 87,
  merged: false,
  url: 'https://github.com/acme/app/pull/42',
  commits: [
    { sha: 'aaaaaaaaaaaa', message: 'TASK-123 add search index' },
    {
      sha: 'bbbbbbbbbbbb',
      message: 'TASK-123 handle empty query',
      url: 'https://github.com/acme/app/commit/bbbbbbbbbbbb',
    },
  ],
}

describe('GitHub development evidence panel', () => {
  it('explains how to link a required task before any activity is detected', () => {
    const markup = renderToStaticMarkup(<GitHubDevelopmentPanel taskKey="TASK-123" proofs={[]} />)

    expect(markup).toContain('Evidence Required')
    expect(markup).toContain('TASK-123-feature-name')
    expect(markup).toContain('TASK-123 implement feature')
    expect(markup).toContain('TASK-123 Feature implementation')
    expect(markup).toContain('No GitHub activity detected yet.')
    expect(markup).toContain('automatically')
    expect(markup).toContain('manager or owner must approve completion')
    expect(markup).toContain('AWAITING GITHUB EVIDENCE')
  })

  it('shows a verified headline, checklist, repository, PR details, metrics and link', () => {
    const markup = renderToStaticMarkup(
      <GitHubDevelopmentPanel
        taskKey="TASK-123"
        proofs={[verifiedProof]}
        projectRepository="acme/app"
        assigneeName="Rahul Shah"
      />
    )

    // Headline verification state
    expect(markup).toContain('Development Verification')
    expect(markup).toContain('VERIFIED BY GITHUB')
    expect(markup).toContain('Verified by GitHub')
    expect(markup).toContain('7 of 7 checks passed')

    // Checklist
    expect(markup).toContain('Verification Checklist')
    expect(markup).toContain('GitHub repository matches project')
    expect(markup).toContain('Pull request detected')
    expect(markup).toContain('Commits detected')
    expect(markup).toContain('Developer identified')
    expect(markup).toContain('Developer matches assignee')
    expect(markup).toContain('Code changes detected')
    expect(markup).toContain('Evidence received from GitHub webhook')

    // Evidence detail
    expect(markup).toContain('acme/app')
    expect(markup).toContain('TASK-123-customer-search')
    expect(markup).toContain('Pull Request #42')
    expect(markup).toContain('Implement customer search')
    expect(markup).toContain('Rahul Shah')
    expect(markup).toContain('Developer verified')
    expect(markup).toContain('Commits')
    expect(markup).toContain('Files changed')
    expect(markup).toContain('+342')
    expect(markup).toContain('-87')
    expect(markup).toContain('PR status:')
    expect(markup).toContain('Open')
    expect(markup).toContain('View Pull Request')
    expect(markup).toContain('Latest commit')
    expect(markup).toContain('TASK-123 handle empty query')
    expect(markup).not.toContain('No GitHub activity detected yet.')
    expect(markup).not.toContain('Self-reported')
  })

  it('visually separates self-reported evidence from verified evidence', () => {
    const markup = renderToStaticMarkup(
      <GitHubDevelopmentPanel
        taskKey="TASK-9"
        projectRepository="acme/app"
        proofs={[
          {
            id: 'proof-2',
            type: 'github',
            source: 'user',
            submittedAt: '2026-10-05T00:00:00.000Z',
            repository: 'acme/app',
            url: 'https://github.com/acme/app/pull/7',
            pullRequestNumber: 7,
          },
        ]}
      />
    )

    expect(markup).toContain('SELF-REPORTED')
    expect(markup).toContain('Self-reported')
    expect(markup).toContain('has not yet been verified by GitHub')
    expect(markup).toContain('Not confirmed by GitHub')
    expect(markup).not.toContain('Verified by GitHub')
  })

  it('reports an author mismatch and an unlinked GitHub account distinctly', () => {
    const mismatch = renderToStaticMarkup(
      <GitHubDevelopmentPanel
        taskKey="TASK-5"
        assigneeName="Rahul Shah"
        proofs={[
          { ...verifiedProof, pullRequestAuthor: 'someone-else', authorMatchesAssignee: false },
        ]}
      />
    )
    expect(mismatch).toContain('Author does not match assignee')
    expect(mismatch).toContain('Rahul Shah')

    const unlinked = renderToStaticMarkup(
      <GitHubDevelopmentPanel
        taskKey="TASK-5"
        proofs={[{ ...verifiedProof, authorMatchesAssignee: undefined }]}
      />
    )
    expect(unlinked).toContain('GitHub account not linked')
  })

  it('flags evidence from a repository that is not the connected one', () => {
    const markup = renderToStaticMarkup(
      <GitHubDevelopmentPanel
        taskKey="TASK-5"
        projectRepository="acme/app"
        proofs={[{ ...verifiedProof, repository: 'facebook/react' }]}
      />
    )

    expect(markup).toContain('is not the connected repository')
    expect(markup).toContain('6 of 7 checks passed')
  })
})
