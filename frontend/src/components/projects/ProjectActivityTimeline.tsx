import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  History,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiProjectActivity, getProjectActivity } from '@/lib/api'
import { joinProjectRoom, onProjectActivity } from '@/lib/socket'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatActivityLabel, formatDateTime, formatRelativeDateTime } from '@/lib/utils'

/** Icon + tint per event family, so the timeline is scannable by colour. */
function activityVisual(activity: ApiProjectActivity) {
  if (activity.eventType.includes('PULL_REQUEST'))
    return { Icon: GitPullRequest, tone: 'bg-info-soft text-info' }
  if (activity.eventType.includes('COMMIT'))
    return { Icon: GitCommit, tone: 'bg-info-soft text-info' }
  if (activity.eventType.includes('PROOF') || activity.eventType === 'TASK_COMPLETED')
    return { Icon: ClipboardCheck, tone: 'bg-success-soft text-success' }
  if (activity.source === 'github') return { Icon: GitBranch, tone: 'bg-info-soft text-info' }
  if (activity.eventType.startsWith('DISCUSSION'))
    return { Icon: MessageSquare, tone: 'bg-primary-soft text-primary' }
  if (activity.eventType === 'STATUS_CHANGED')
    return { Icon: CheckCircle2, tone: 'bg-success-soft text-success' }
  return { Icon: Clock3, tone: 'bg-muted text-muted-foreground' }
}

function activityLabel(activity: ApiProjectActivity) {
  if (activity.eventType === 'STATUS_CHANGED' && activity.metadata?.workflow === 'proof_submission')
    return 'Task submitted for review'
  if (activity.eventType === 'TASK_COMPLETED')
    return activity.metadata?.workflow === 'approved' ? 'Proof approved' : 'Task completed'
  return formatActivityLabel(activity.eventType)
}

function activityDetail(activity: ApiProjectActivity) {
  if (activity.source === 'github' && activity.eventType === 'GIT_COMMIT') {
    return String(activity.metadata?.message || activity.description)
      .split('\n')[0]
      .replace(/^git commit detected:\s*/i, '')
  }
  if (activity.source === 'github' && activity.eventType.startsWith('PULL_REQUEST_')) {
    return activity.description.replace(/^pull_request_(?:created|updated|closed|merged):\s*/i, '')
  }
  if (
    activity.metadata?.workflow === 'proof_submission' ||
    activity.metadata?.workflow === 'approved'
  )
    return ''
  return activity.description
}

export function ProjectActivityTimeline({
  projectId,
  compact = false,
}: {
  projectId: string
  compact?: boolean
}) {
  const [activities, setActivities] = useState<ApiProjectActivity[]>([])
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<{
    page: number
    limit: number
    total: number
    pages: number
  }>()
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = async (nextPage: number, append: boolean) => {
    if (!projectId) return
    append ? setIsLoadingMore(true) : setIsLoading(true)
    try {
      const result = await getProjectActivity(projectId, nextPage)
      setActivities(current => (append ? [...current, ...result.items] : result.items))
      setPagination(result.pagination)
      setPage(nextPage)
      setError('')
    } catch {
      setError('Unable to load project activity. Try again.')
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  useEffect(() => {
    void load(1, false)
    const leave = joinProjectRoom(projectId)
    let refreshTimer: number | undefined
    const stop = onProjectActivity(event => {
      if (
        event?.projectId !== projectId ||
        (!event.activity && !event.thread && !event.reply && !event.project)
      )
        return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        void load(1, false)
      }, 100)
    })
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      stop()
      leave()
    }
  }, [projectId])

  const visibleActivities = compact ? activities.slice(0, 5) : activities

  const items = (
    <div
      className={cn(
        compact
          ? 'divide-y'
          : 'relative space-y-4 px-5 py-5 before:absolute before:bottom-6 before:left-[2.0625rem] before:top-6 before:w-px before:bg-border'
      )}
    >
      {visibleActivities.map(activity => {
        const { Icon, tone } = activityVisual(activity)
        const detail = activityDetail(activity)
        return (
          <article
            key={activity.id}
            className={cn('flex gap-3', compact ? 'px-5 py-3.5' : 'relative')}
          >
            <span
              className={cn(
                'z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                tone,
                !compact && 'ring-4 ring-card'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-5">{activityLabel(activity)}</p>
              {detail && (
                <p className="mt-0.5 break-words text-sm text-muted-foreground">{detail}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {activity.actor?.name || (activity.source === 'github' ? 'GitHub' : 'System')}
                {' · '}
                <time dateTime={activity.timestamp} title={formatDateTime(activity.timestamp)}>
                  {formatRelativeDateTime(activity.timestamp)}
                </time>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3">
                {activity.task && (
                  <Link
                    to={`/tasks/${activity.task.id}`}
                    className="inline-flex min-w-0 items-baseline gap-1.5 text-xs text-primary hover:underline"
                  >
                    <span className="font-mono">{activity.task.taskKey || 'Task'}</span>
                    {activity.task.title && <span className="truncate">{activity.task.title}</span>}
                  </Link>
                )}
                {typeof activity.metadata?.url === 'string' && (
                  <a
                    href={activity.metadata.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )

  const body = isLoading ? (
    <div
      role="status"
      aria-label="Loading activity"
      className={cn('space-y-4', compact ? 'px-5 py-4' : 'px-5 py-5')}
    >
      {Array.from({ length: compact ? 3 : 5 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  ) : error ? (
    <div className="p-5">
      <ErrorState
        title="Unable to load activity"
        description="Try refreshing this section."
        onRetry={() => void load(1, false)}
      />
    </div>
  ) : activities.length === 0 ? (
    <EmptyState
      variant="inline"
      icon={History}
      title="No activity yet"
      description="Project activity appears here as your team works."
    />
  ) : (
    items
  )

  return (
    <Card elevation="xs">
      <CardHeader className="border-b">
        <div className="min-w-0">
          <CardTitle>{compact ? 'Recent activity' : 'Project activity'}</CardTitle>
          {!compact && (
            <p className="mt-1 text-sm text-muted-foreground">
              Development, task, discussion, and GitHub events.
            </p>
          )}
        </div>
        {compact ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}/activity`}>View all</Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void load(1, false)}
            aria-label="Refresh project activity"
            title="Refresh activity"
          >
            <RefreshCw />
          </Button>
        )}
      </CardHeader>

      {body}

      {!compact && pagination && page < pagination.pages && (
        <div className="border-t px-5 py-3.5 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(page + 1, true)}
            loading={isLoadingMore}
          >
            Load more activity
          </Button>
        </div>
      )}
    </Card>
  )
}
