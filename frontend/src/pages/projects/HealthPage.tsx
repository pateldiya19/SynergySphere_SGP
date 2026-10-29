import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ListTodo,
  RefreshCw,
  Users,
  Workflow,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, StatsSkeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { ApiProjectHealth, getProjectHealth } from '@/lib/api'
import { joinProjectRoom, onProjectActivity } from '@/lib/socket'
import { cn, formatDateTime } from '@/lib/utils'

const statusTone: Record<
  ApiProjectHealth['status'],
  { card: string; badge: 'success' | 'warning' | 'destructive' }
> = {
  Healthy: { card: 'border-success/30 bg-success-soft/40', badge: 'success' },
  'At Risk': { card: 'border-warning/30 bg-warning-soft/40', badge: 'warning' },
  Critical: { card: 'border-destructive/30 bg-destructive-soft/40', badge: 'destructive' },
}

const severityVariant = {
  high: 'warning',
  critical: 'destructive',
} as const

export function HealthPage() {
  const { id } = useParams<{ id: string }>()
  const [health, setHealth] = useState<ApiProjectHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const { addToast } = useToast()

  const load = async () => {
    if (!id) return
    try {
      setHealth(await getProjectHealth(id))
      setError('')
    } catch {
      setError('Unable to load project health. Please try again.')
      addToast({
        title: 'Project health unavailable',
        description: 'Please try again.',
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    if (!id) return
    const leave = joinProjectRoom(id)
    let refreshTimer: number | undefined
    const stop = onProjectActivity(event => {
      if (event.projectId !== id || (!event.activity && !event.task)) return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        void load()
      }, 100)
    })
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      stop()
      leave()
    }
  }, [id])

  if (!id)
    return (
      <EmptyState title="Project not found" description="This project may have been deleted." />
    )

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: 'Projects', to: '/projects' },
        { label: 'Project', to: `/projects/${id}` },
        { label: 'Health' },
      ]}
      title="Health"
      description="A rule-based assessment derived from current tasks and recorded activity."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsLoading(true)
            void load()
          }}
          loading={isLoading}
        >
          <RefreshCw aria-hidden />
          Refresh
        </Button>
      }
    />
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <ProjectTabs projectId={id} active="health" />
        <StatsSkeleton count={4} />
      </div>
    )
  }

  if (error || !health) {
    return (
      <div className="space-y-6">
        {header}
        <ProjectTabs projectId={id} active="health" />
        <ErrorState
          title="Project health unavailable"
          description={error || 'Please try again.'}
          onRetry={() => {
            setIsLoading(true)
            void load()
          }}
        />
      </div>
    )
  }

  const tone = statusTone[health.status]
  const metrics = [
    { label: 'Tasks', value: health.metrics.totalTasks, icon: ListTodo },
    { label: 'Completed', value: health.metrics.completedTasks, icon: CheckCircle2 },
    { label: 'Overdue', value: health.metrics.overdueTasks, icon: Clock3 },
    { label: 'Blocked', value: health.metrics.blockedTasks, icon: Workflow },
    { label: 'Dependency waiting', value: health.metrics.dependencyBlockedTasks, icon: Workflow },
    { label: 'Urgent due soon', value: health.metrics.urgentDueSoonTasks, icon: AlertTriangle },
    { label: 'Unassigned', value: health.metrics.unassignedTasks, icon: Users },
  ]

  return (
    <div className="space-y-6">
      {header}
      <ProjectTabs projectId={id} active="health" />

      <Card elevation="sm" className={cn(tone.card)}>
        <CardHeader>
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Current assessment
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <CardTitle className="text-xl">{health.status}</CardTitle>
              <Badge variant={tone.badge} dot>
                {health.risks.length === 0
                  ? 'No open risks'
                  : `${health.risks.length} risk${health.risks.length === 1 ? '' : 's'}`}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Updated <time dateTime={health.assessedAt}>{formatDateTime(health.assessedAt)}</time>
            </p>
          </div>
        </CardHeader>
      </Card>

      <section
        aria-label="Health metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
      >
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border bg-card p-4 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <p className="mt-2 text-xl font-semibold leading-none tabular">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Risks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signals that may need project attention.
          </p>
        </div>

        {health.risks.length === 0 ? (
          <Card elevation="xs" className="border-success/25 bg-success-soft/30">
            <CardContent className="flex items-center gap-3 pt-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">No current risks detected</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  This project is tracking as expected.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {health.risks.map(risk => (
              <Card key={risk.key} elevation="xs">
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{risk.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{risk.description}</p>
                  </div>
                  <Badge variant={severityVariant[risk.severity]} className="capitalize">
                    {risk.severity}
                  </Badge>
                </CardHeader>
                {risk.tasks.length > 0 && (
                  <div className="border-t">
                    <ul className="divide-y">
                      {risk.tasks.map(task => (
                        <li key={task.id}>
                          <Link
                            to={`/tasks/${task.id}`}
                            className="group flex items-center justify-between gap-4 px-5 py-2.5 text-sm transition-colors hover:bg-accent/40"
                          >
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                {task.taskKey || 'Task'}
                              </span>
                              <span className="truncate transition-colors group-hover:text-primary">
                                {task.title}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">Open</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {health.metrics.activeMembers} members have open assigned work ·{' '}
        {health.metrics.inactivityDays} days since recorded activity
      </p>
    </div>
  )
}
