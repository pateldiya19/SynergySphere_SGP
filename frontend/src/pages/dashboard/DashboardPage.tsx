import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FolderKanban,
  GitPullRequest,
  Inbox,
  ListTodo,
  MailPlus,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import {
  ApiDashboard,
  ApiDashboardActivity,
  ApiInvitation,
  getDashboard,
  getIncomingInvitations,
  respondToInvitation,
} from '@/lib/api'
import { subscribeToTaskStatusUpdates } from '@/lib/my-task-status-sync'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState, StatsSkeleton, TableSkeleton } from '@/components/ui/States'
import { PriorityBadge, StatusBadge } from '@/components/tasks/TaskBadges'
import { useToast } from '@/components/ui/Toast'
import {
  cn,
  formatActivityLabel,
  formatCount,
  formatDate,
  formatDateTime,
  formatRelativeDateTime,
} from '@/lib/utils'

function dateLabel(value?: string) {
  if (!value) return '—'
  return formatDate(value)
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function activityIcon(activity: ApiDashboardActivity) {
  if (activity.source === 'github') return GitPullRequest
  if (activity.eventType.startsWith('DISCUSSION')) return MessageSquare
  return CheckCircle2
}

function ActivityRow({ activity }: { activity: ApiDashboardActivity }) {
  const relatedTask = activity.task
  const externalUrl = typeof activity.metadata?.url === 'string' ? activity.metadata.url : undefined
  const Icon = activityIcon(activity)

  return (
    <article className="flex gap-3 px-5 py-3.5">
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          activity.source === 'github' ? 'bg-info-soft text-info' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5">{formatActivityLabel(activity.eventType)}</p>
        <p className="mt-0.5 truncate text-sm">
          {relatedTask ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-primary"
              to={`/tasks/${relatedTask.id}`}
            >
              {relatedTask.taskKey ? `${relatedTask.taskKey} — ` : ''}
              {relatedTask.title}
            </Link>
          ) : (
            <span className="text-muted-foreground">{activity.project || 'Project activity'}</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {activity.actor?.name || (activity.source === 'github' ? 'GitHub' : 'System')}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={activity.timestamp} title={formatDateTime(activity.timestamp)}>
            {formatRelativeDateTime(activity.timestamp)}
          </time>
          {externalUrl && (
            <a
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [invitations, setInvitations] = useState<ApiInvitation[]>([])
  const firstName = user?.name?.split(' ')[0] || 'there'

  const loadDashboard = async () => {
    setIsLoading(true)
    setError('')
    try {
      setDashboard(await getDashboard())
    } catch {
      setError('Dashboard could not be loaded. Please try again.')
      addToast({
        title: 'Unable to load dashboard',
        description: 'Please try again.',
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const dashboardProjectRoomKey = JSON.stringify(
    [
      ...new Set(
        (dashboard?.tasks || [])
          .map(task => (typeof task.projectId === 'string' ? task.projectId : task.projectId?.id))
          .filter(Boolean)
      ),
    ].sort()
  )
  useEffect(() => {
    const tasks = dashboard?.tasks || []
    if (tasks.length === 0) return
    return subscribeToTaskStatusUpdates(tasks, updateTasks => {
      setDashboard(current =>
        current ? { ...current, tasks: updateTasks(current.tasks) } : current
      )
    })
  }, [dashboardProjectRoomKey])

  useEffect(() => {
    void getIncomingInvitations()
      .then(setInvitations)
      .catch(() => setInvitations([]))
  }, [])

  const respondToProjectInvitation = async (
    invitationId: string,
    response: 'accept' | 'decline'
  ) => {
    try {
      await respondToInvitation(invitationId, response)
      setInvitations(current => current.filter(invitation => invitation.id !== invitationId))
      addToast({
        title: response === 'accept' ? 'Invitation accepted' : 'Invitation declined',
        description:
          response === 'accept' ? 'You joined the project.' : 'The invitation was declined.',
        type: 'success',
      })
    } catch (responseError: any) {
      addToast({
        title: 'Invitation response failed',
        description: responseError.message,
        type: 'error',
      })
    }
  }

  const metrics = useMemo(() => {
    const tasks = dashboard?.tasks || []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const overdue = tasks.filter(
      task => task.status !== 'done' && task.dueDate && new Date(task.dueDate) < today
    ).length
    return [
      {
        label: 'Assigned to me',
        value: tasks.length,
        icon: ListTodo,
        tone: 'primary' as const,
        to: '/my-tasks',
      },
      {
        label: 'In progress',
        value: tasks.filter(task => task.status === 'in_progress').length,
        icon: Clock3,
        tone: 'info' as const,
      },
      {
        label: 'Completed',
        value: tasks.filter(task => task.status === 'done').length,
        icon: CheckCircle2,
        tone: 'success' as const,
      },
      {
        label: 'Overdue',
        value: overdue,
        icon: AlertCircle,
        tone: overdue > 0 ? ('danger' as const) : ('neutral' as const),
      },
    ]
  }, [dashboard])

  const header = (
    <PageHeader
      eyebrow="Workspace overview"
      title={`${greeting()}, ${firstName}`}
      description="Here's what's happening across your projects today."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadDashboard()}
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
        <StatsSkeleton />
        <TableSkeleton rows={5} columns={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          title="Dashboard unavailable"
          description={error}
          onRetry={() => void loadDashboard()}
        />
      </div>
    )
  }

  const tasks = dashboard?.tasks || []
  const projects = dashboard?.projects || []
  const activities = dashboard?.activities || []
  const githubActivities = activities.filter(activity => activity.source === 'github')
  const workspaceActivities = activities.filter(activity => activity.source !== 'github')
  const notifications = dashboard?.notifications || []

  return (
    <div className="space-y-6">
      {header}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(metric => (
          <StatCard key={metric.label} {...metric} />
        ))}
      </section>

      {invitations.length > 0 && (
        <Card elevation="sm" className="border-primary/30 bg-primary-soft/30">
          <CardHeader>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MailPlus className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <CardTitle>Project invitations</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  You have {formatCount(invitations.length, 'pending invitation')}.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {invitations.map(invitation => {
              const project =
                typeof invitation.projectId === 'object' ? invitation.projectId : undefined
              const inviter =
                typeof invitation.inviterId === 'object' ? invitation.inviterId : undefined
              return (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-md border bg-card p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{project?.name || 'Project invitation'}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Invited by {inviter?.name || 'a project member'}
                      {project?.description ? ` · ${project.description}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void respondToProjectInvitation(invitation.id, 'accept')}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void respondToProjectInvitation(invitation.id, 'decline')}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card elevation="xs">
        <CardHeader className="border-b">
          <CardTitle>My work</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/my-tasks">
              View all
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardHeader>
        {tasks.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={ListTodo}
            title="No tasks assigned to you"
            description="Tasks assigned to you across every project will show up here."
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Task
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Project
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Priority
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks.slice(0, 8).map(task => (
                  <tr key={task.id} className="group transition-colors hover:bg-accent/40">
                    <td className="max-w-sm px-5 py-3">
                      <Link className="flex min-w-0 items-baseline gap-2" to={`/tasks/${task.id}`}>
                        {task.taskKey && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {task.taskKey}
                          </span>
                        )}
                        <span className="truncate font-medium transition-colors group-hover:text-primary">
                          {task.title}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="block max-w-[12rem] truncate">
                        {typeof task.projectId === 'object' ? task.projectId.name : task.projectId}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-5 py-3">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-5 py-3 text-muted-foreground tabular">
                      {dateLabel(task.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card elevation="xs">
          <CardHeader className="border-b">
            <CardTitle>Active projects</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projects">
                All projects
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          {projects.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={FolderKanban}
              title="No active projects"
              description="Create a project or accept an invitation to get started."
              action={
                <Button size="sm" asChild>
                  <Link to="/projects">Go to projects</Link>
                </Button>
              }
            />
          ) : (
            <div className="divide-y">
              {projects.map(project => {
                const progress = project.taskProgress.total
                  ? Math.round((project.taskProgress.done / project.taskProgress.total) * 100)
                  : 0
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="group block px-5 py-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="min-w-0 truncate font-medium transition-colors group-hover:text-primary">
                        {project.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatCount(project.taskProgress.open, 'open task', 'open tasks')}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={progress} size="xs" className="flex-1" />
                      <span className="w-9 shrink-0 text-right text-xs font-medium tabular text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatCount(project.members?.length || 0, 'member')}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

        <Card elevation="xs">
          <CardHeader className="border-b">
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          {workspaceActivities.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={Inbox}
              title="No recent activity"
              description="Task and discussion updates will appear here."
            />
          ) : (
            <div className="divide-y">
              {workspaceActivities.slice(0, 7).map(activity => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card elevation="xs">
          <CardHeader className="border-b">
            <div className="flex min-w-0 items-center gap-2">
              <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle>GitHub activity</CardTitle>
            </div>
          </CardHeader>
          {githubActivities.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={GitPullRequest}
              title="No GitHub activity"
              description="Connect a repository to a project to see commits and pull requests here."
            />
          ) : (
            <div className="divide-y">
              {githubActivities.slice(0, 6).map(activity => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </Card>

        <Card elevation="xs">
          <CardHeader className="border-b">
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          {notifications.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={Bell}
              title="You're all caught up"
              description="New notifications will appear here."
            />
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 5).map(notification => (
                <div
                  key={notification.id}
                  className={cn('flex gap-3 px-5 py-3.5', notification.read && 'opacity-60')}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      notification.read ? 'bg-muted-foreground/30' : 'bg-primary'
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      <time
                        dateTime={notification.createdAt}
                        title={formatDateTime(notification.createdAt)}
                      >
                        {formatRelativeDateTime(notification.createdAt)}
                      </time>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
