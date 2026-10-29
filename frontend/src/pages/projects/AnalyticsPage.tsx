import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ListTodo,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState, StatsSkeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { ApiProjectAnalytics, getProjectAnalytics } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Horizontal bar list used for priority and assignee breakdowns. */
function BarList({
  items,
  getLabel,
  getValue,
  tone = 'bg-primary',
  emptyLabel,
}: {
  items: any[]
  getLabel: (item: any) => string
  getValue: (item: any) => number
  tone?: string
  emptyLabel: string
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  const maximum = Math.max(...items.map(getValue), 1)
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={getLabel(item)}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{getLabel(item)}</span>
            <span className="shrink-0 font-medium tabular text-muted-foreground">
              {getValue(item)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-emphasis',
                tone
              )}
              style={{ width: `${(getValue(item) / maximum) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const [analytics, setAnalytics] = useState<ApiProjectAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const { addToast } = useToast()

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      setAnalytics(await getProjectAnalytics(id))
      setError('')
    } catch {
      setError('Unable to load project analytics. Please try again.')
      addToast({ title: 'Analytics unavailable', description: 'Please try again.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
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
        { label: 'Analytics' },
      ]}
      title="Analytics"
      description="Task progress, priority distribution, and team workload."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} loading={isLoading}>
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
        <ProjectTabs projectId={id} active="analytics" />
        <StatsSkeleton count={4} />
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="space-y-6">
        {header}
        <ProjectTabs projectId={id} active="analytics" />
        <ErrorState
          title="Analytics unavailable"
          description={error || 'Please try again.'}
          onRetry={() => void load()}
        />
      </div>
    )
  }

  const trendMaximum = Math.max(...analytics.completionOverTime.map(item => item.count), 1)
  const summaryCards = [
    { label: 'Total tasks', value: analytics.totalTasks, icon: ListTodo, tone: 'primary' as const },
    {
      label: 'Completed',
      value: analytics.completedTasks,
      icon: CheckCircle2,
      tone: 'success' as const,
    },
    { label: 'In progress', value: analytics.inProgressTasks, icon: Clock3, tone: 'info' as const },
    {
      label: 'Overdue',
      value: analytics.overdueTasks,
      icon: AlertTriangle,
      tone: analytics.overdueTasks > 0 ? ('danger' as const) : ('neutral' as const),
    },
  ]
  const secondaryCards = [
    { label: 'To do', value: analytics.todoTasks },
    { label: 'Blocked', value: analytics.blockedTasks },
    { label: 'Ready for review', value: analytics.readyForReviewTasks },
    { label: 'Changes requested', value: analytics.changesRequestedTasks },
  ]

  return (
    <div className="space-y-6">
      {header}
      <ProjectTabs projectId={id} active="analytics" />

      <section aria-label="Task summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(card => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <section aria-label="Status breakdown" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {secondaryCards.map(card => (
          <div key={card.label} className="rounded-lg border bg-card p-4 shadow-xs">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-xl font-semibold leading-none tabular">{card.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card elevation="xs">
          <CardHeader className="border-b">
            <CardTitle>Completion</CardTitle>
            <span className="text-2xl font-semibold tabular">
              {analytics.completionPercentage}%
            </span>
          </CardHeader>
          <CardContent className="pt-5">
            <ProgressBar value={analytics.completionPercentage} tone="success" size="lg" />
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{analytics.completedTasks} completed</span>
              <span>{analytics.totalTasks} total</span>
            </div>
          </CardContent>
        </Card>

        <Card elevation="xs">
          <CardHeader className="border-b">
            <div className="min-w-0">
              <CardTitle>Tasks by priority</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Where attention is concentrated.</p>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <BarList
              items={analytics.tasksByPriority}
              getLabel={item => item.priority[0].toUpperCase() + item.priority.slice(1)}
              getValue={item => item.count}
              emptyLabel="No tasks to analyse yet."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card elevation="xs">
          <CardHeader className="border-b">
            <div className="flex min-w-0 items-center gap-2">
              <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <CardTitle>Completed over time</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Daily completion events.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {analytics.completionOverTime.length === 0 ? (
              <EmptyState
                variant="inline"
                title="No completed tasks yet"
                description="Completion history appears once tasks are approved."
              />
            ) : (
              <div className="scrollbar-slim flex h-44 items-end gap-2 overflow-x-auto border-b border-l pb-0 pl-3 pt-4">
                {analytics.completionOverTime.map(item => (
                  <div
                    key={item.date}
                    className="flex h-full min-w-8 flex-col items-center justify-end gap-1.5"
                  >
                    <span className="text-2xs font-medium tabular text-muted-foreground">
                      {item.count}
                    </span>
                    <div
                      className="w-6 rounded-t bg-primary transition-[height] duration-500 ease-emphasis"
                      style={{ height: `${Math.max((item.count / trendMaximum) * 100, 6)}%` }}
                      title={`${item.date}: ${item.count}`}
                    />
                    <span className="text-2xs text-muted-foreground [writing-mode:vertical-rl]">
                      {item.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card elevation="xs">
          <CardHeader className="border-b">
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <CardTitle>Tasks by assignee</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Assigned workload per person.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <BarList
              items={analytics.tasksByAssignee}
              getLabel={item => item.assignee?.name || 'Unassigned'}
              getValue={item => item.total}
              tone="bg-info"
              emptyLabel="No assigned tasks yet."
            />
          </CardContent>
        </Card>
      </div>

      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="min-w-0">
            <CardTitle>Member workload</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Task allocation across current project members.
            </p>
          </div>
        </CardHeader>
        {analytics.memberWorkload.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Users}
            title="No members yet"
            description="Invite teammates to see workload distribution."
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Member
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Assigned
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analytics.memberWorkload.map(item => (
                  <tr key={item.member.id} className="transition-colors hover:bg-accent/30">
                    <td className="px-5 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={item.member.name} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.member.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={item.member.role === 'owner' ? 'primary' : 'secondary'}
                        size="sm"
                        className="capitalize"
                      >
                        {item.member.role}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 tabular">{item.assignedTasks}</td>
                    <td className="px-5 py-3 tabular">{item.completedTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
