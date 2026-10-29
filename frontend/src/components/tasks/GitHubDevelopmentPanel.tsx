import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileDiff,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MinusCircle,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'
import { ApiTaskProof } from '@/lib/api'
import { formatCount, formatDateTime } from '@/lib/utils'
import {
  VerificationCheck,
  getCommitCount,
  getPullRequestStateLabel,
  getTaskVerification,
  isVerifiedProof,
} from '@/lib/task-verification'

type GitHubDevelopmentPanelProps = {
  taskKey: string
  proofs: ApiTaskProof[]
  /** `owner/name` of the repository connected to the project, when known. */
  projectRepository?: string
  /** Shown alongside author verification so the reviewer knows who was expected. */
  assigneeName?: string
  /** Set when the task is configured to require GitHub evidence. */
  evidenceRequired?: boolean
}

function CheckRow({ check }: { check: VerificationCheck }) {
  const icon =
    check.state === 'pass' ? (
      <CheckCircle2
        className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden
      />
    ) : check.state === 'fail' ? (
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
    ) : (
      <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    )
  const prefix = check.state === 'pass' ? '✓' : check.state === 'fail' ? '⚠' : '—'
  const stateLabel =
    check.state === 'pass' ? 'Verified' : check.state === 'fail' ? 'Check failed' : 'Not verified'

  return (
    <li className="flex min-w-0 items-start gap-2.5 border-b py-2.5 text-sm last:border-b-0">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="sr-only">{prefix} </span>
        <span
          className={check.state === 'fail' ? 'font-medium text-destructive' : 'text-foreground'}
        >
          {check.label}
        </span>
        {check.detail && (
          <span className="ml-1.5 break-words text-xs text-muted-foreground">({check.detail})</span>
        )}
      </span>
      <span
        className={`shrink-0 text-xs font-semibold ${
          check.state === 'pass'
            ? 'text-emerald-700 dark:text-emerald-300'
            : check.state === 'fail'
            ? 'text-destructive'
            : 'text-muted-foreground'
        }`}
      >
        {stateLabel}
      </span>
    </li>
  )
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words font-mono text-sm font-semibold ${
          tone === 'positive'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'negative'
            ? 'text-destructive'
            : 'text-foreground'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

export function GitHubDevelopmentPanel({
  taskKey,
  proofs,
  projectRepository,
  assigneeName,
  evidenceRequired = true,
}: GitHubDevelopmentPanelProps) {
  const verification = getTaskVerification(proofs, projectRepository)
  const isVerified = verification.status === 'verified'
  const isSelfReported = verification.status === 'self_reported'

  const statusTone = isVerified
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : isSelfReported
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    : 'border-border bg-muted/40 text-muted-foreground'

  const statusHeadline = isVerified
    ? 'Verified by GitHub'
    : isSelfReported
    ? 'Self-reported evidence'
    : 'Awaiting development evidence'

  const statusExplanation = isVerified
    ? 'This task has real development evidence delivered by a signed GitHub webhook.'
    : isSelfReported
    ? 'This evidence has not yet been verified by GitHub. A developer submitted the link manually.'
    : 'No GitHub activity has been linked to this task yet.'

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Development Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Development evidence for {taskKey}, collected automatically from GitHub.
          </p>
        </div>
        {evidenceRequired && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Evidence Required
          </span>
        )}
      </header>

      {/* Headline verification status — the first thing a reviewer reads. */}
      <section aria-label="Verification status" className={`rounded-lg border p-4 ${statusTone}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {isVerified ? (
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
          ) : isSelfReported ? (
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <Circle className="h-5 w-5 shrink-0" aria-hidden />
          )}
          <span className="text-sm font-bold uppercase tracking-wide">
            {isVerified
              ? '\u{1F7E2} VERIFIED BY GITHUB'
              : isSelfReported
              ? '\u{1F7E1} SELF-REPORTED'
              : 'AWAITING GITHUB EVIDENCE'}
          </span>
          <span className="text-sm font-semibold">{statusHeadline}</span>
          <span className="ml-auto text-xs font-medium">
            {verification.passedCount} of {verification.totalCount} checks passed
          </span>
        </div>
        <p className="mt-2 text-sm">{statusExplanation}</p>
      </section>

      {/* Verification checklist */}
      <section aria-label="Verification checklist" className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Verification Checklist</h3>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
          {verification.checks.map(check => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>
      </section>

      {/* How to link work — only useful while no evidence exists. */}
      {verification.status === 'none' && (
        <section className="rounded-md border bg-muted/20 p-4">
          <p className="text-sm font-medium">Link your work automatically by using:</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Branch</dt>
              <dd className="mt-1 break-all font-mono">{taskKey}-feature-name</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Commit</dt>
              <dd className="mt-1 break-words font-mono">{taskKey} implement feature</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Pull Request</dt>
              <dd className="mt-1 break-words font-mono">{taskKey} Feature implementation</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            The system automatically detects matching GitHub activity. Once evidence appears, submit
            it for review; a manager or owner must approve completion.
          </p>
        </section>
      )}

      <section aria-label="Development activity" className="border-t pt-4">
        <h3 className="text-sm font-semibold">Development Evidence</h3>
        {proofs.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed p-5">
            <p className="font-medium">No GitHub activity detected yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once you push a matching branch or commit, or create a matching pull request, it will
              appear here automatically.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {proofs.map(proof => {
              const verified = isVerifiedProof(proof)
              const commitCount = getCommitCount(proof)
              const latestCommit = proof.commits?.[proof.commits.length - 1]
              const hasPullRequest = Boolean(proof.pullRequestNumber || proof.pullRequestTitle)
              const lastActivity = proof.lastUpdatedAt || proof.submittedAt

              return (
                <article
                  key={proof.id}
                  className={`space-y-4 rounded-lg border p-4 ${
                    verified
                      ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                      : 'border-amber-500/40 border-dashed bg-amber-500/[0.04]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide ${
                        verified
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {verified ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified by GitHub
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Self-reported
                        </>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Last activity {formatDateTime(lastActivity)}
                    </span>
                  </div>

                  {!verified && (
                    <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                      This evidence has not yet been verified by GitHub and cannot complete a task
                      that requires verified evidence.
                    </p>
                  )}

                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Repository
                      </dt>
                      <dd className="mt-1 break-all font-mono text-sm">
                        {proof.repository || 'Not verified'}
                      </dd>
                    </div>
                    {proof.branch && (
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          <GitBranch className="h-3.5 w-3.5" aria-hidden /> Branch
                        </dt>
                        <dd className="mt-1 break-all font-mono text-sm">{proof.branch}</dd>
                      </div>
                    )}
                    {hasPullRequest && (
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Pull Request
                        </dt>
                        <dd className="mt-1 min-w-0 text-sm">
                          <span className="font-mono font-semibold">
                            Pull Request{' '}
                            {proof.pullRequestNumber ? `#${proof.pullRequestNumber}` : ''}
                          </span>
                          {proof.pullRequestTitle && (
                            <span className="block break-words text-muted-foreground">
                              {proof.pullRequestTitle}
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <UserIcon className="h-3.5 w-3.5" aria-hidden /> Author
                      </dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span>
                          {proof.authorMatchesAssignee === true && assigneeName
                            ? assigneeName
                            : proof.pullRequestAuthor
                            ? `@${proof.pullRequestAuthor}`
                            : 'Not verified'}
                        </span>
                        {proof.pullRequestAuthor && (
                          <span className="font-mono text-xs text-muted-foreground">
                            @{proof.pullRequestAuthor}
                          </span>
                        )}
                        {proof.authorMatchesAssignee === true && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Developer verified
                          </span>
                        )}
                        {proof.authorMatchesAssignee === false && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Author does not
                            match assignee
                            {assigneeName ? ` (${assigneeName})` : ''}
                          </span>
                        )}
                        {proof.authorMatchesAssignee === undefined && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <MinusCircle className="h-3.5 w-3.5" aria-hidden /> Not verified against
                            assignee
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MetricTile
                      label="Commits"
                      value={
                        proof.commitCount !== undefined || proof.commits !== undefined
                          ? String(commitCount)
                          : 'Not verified'
                      }
                    />
                    <MetricTile
                      label="Files changed"
                      value={
                        proof.filesChanged === undefined
                          ? 'Not verified'
                          : String(proof.filesChanged)
                      }
                    />
                    <MetricTile
                      label="Additions"
                      value={
                        proof.additions === undefined
                          ? 'Not verified'
                          : formatCount(proof.additions, 'addition')
                      }
                      tone="positive"
                    />
                    <MetricTile
                      label="Deletions"
                      value={
                        proof.deletions === undefined
                          ? 'Not verified'
                          : formatCount(proof.deletions, 'deletion')
                      }
                      tone="negative"
                    />
                  </dl>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <FileDiff className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="text-muted-foreground">PR status:</span>
                      <span
                        className={`font-semibold ${
                          proof.state === 'merged' || proof.merged
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : proof.state === 'closed'
                            ? 'text-destructive'
                            : 'text-foreground'
                        }`}
                      >
                        {getPullRequestStateLabel(proof)}
                      </span>
                    </span>
                    {proof.url && (
                      <a
                        href={proof.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        {proof.pullRequestNumber ? 'View Pull Request' : 'View Commit'}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </div>

                  {latestCommit && (
                    <div className="rounded-md border bg-background p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <GitCommit className="h-3.5 w-3.5" aria-hidden /> Latest commit
                      </p>
                      <p className="mt-1 min-w-0 text-sm">
                        <span className="mr-2 font-mono text-xs">
                          {latestCommit.sha.slice(0, 8)}
                        </span>
                        {latestCommit.url ? (
                          <a
                            href={latestCommit.url}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words hover:text-primary hover:underline"
                          >
                            {latestCommit.message || 'Commit'}
                          </a>
                        ) : (
                          <span className="break-words">{latestCommit.message || 'Commit'}</span>
                        )}
                      </p>
                    </div>
                  )}

                  {(proof.commits || []).length > 1 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        All {proof.commits!.length} linked commits
                      </summary>
                      <ul className="mt-2 space-y-1 border-l pl-3 text-xs text-muted-foreground">
                        {proof.commits!.map(commit => (
                          <li key={commit.sha} className="min-w-0">
                            <span className="mr-2 font-mono">{commit.sha.slice(0, 8)}</span>
                            {commit.url ? (
                              <a
                                href={commit.url}
                                target="_blank"
                                rel="noreferrer"
                                className="break-words hover:text-primary"
                              >
                                {commit.message || 'Commit'}
                              </a>
                            ) : (
                              <span className="break-words">{commit.message || 'Commit'}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
