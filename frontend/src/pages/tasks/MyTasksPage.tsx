import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ListTodo, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState, StatsSkeleton, TableSkeleton } from '@/components/ui/States'
import { PriorityBadge, PriorityRail, StatusBadge } from '@/components/tasks/TaskBadges'
import { useToast } from '@/components/ui/Toast'
import { apiRequest, ApiTask } from '@/lib/api'
import { subscribeToTaskStatusUpdates } from '@/lib/my-task-status-sync'
import { cn, formatDate } from '@/lib/utils'

export function MyTasksPage() {
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { addToast } = useToast()

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const result = await apiRequest<ApiTask[]>('/api/tasks/my-tasks')
      setTasks(result || [])
    } catch {
      setLoadError('Unable to load your tasks. Please try again.')
      addToast({
        title: 'Unable to load your tasks',
        description: 'Please try again.',
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const projectRoomKey = JSON.stringify(
    [
      ...new Set(
        tasks
          .map(task => (typeof task.projectId === 'string' ? task.projectId : task.projectId?.id))
          .filter(Boolean)
      ),
    ].sort()
  )
  useEffect(() => subscribeToTaskStatusUpdates(tasks, setTasks), [projectRoomKey])

  const updateStatus = async (task: ApiTask, status: ApiTask['status']) => {
    if (status === 'done' || status === 'ready_for_review' || status === 'changes_requested') {
      addToast({
        title: 'Use Proof of Work',
        description: 'Submit proof or review the task from its details page.',
        type: 'error',
      })
      return
    }
    try {
      await apiRequest(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (error: any) {
      addToast({ title: 'Status could not be updated', description: error.message, type: 'error' })
    }
  }

  const isOverdue = (task: ApiTask) =>
    Boolean(task.dueDate && task.status !== 'done' && new Date(task.dueDate).getTime() < Date.now())

  const metrics = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const overdue = tasks.filter(
      task => task.status !== 'done' && task.dueDate && new Date(task.dueDate) < today
    ).length
    return [
      {
        label: 'Open',
        value: tasks.filter(task => task.status !== 'done').length,
        tone: 'primary' as const,
      },
      {
        label: 'In progress',
        value: tasks.filter(task => task.status === 'in_progress').length,
        tone: 'info' as const,
      },
      {
        label: 'In review',
        value: tasks.filter(task => task.status === 'ready_for_review').length,
        tone: 'warning' as const,
      },
      {
        label: 'Overdue',
        value: overdue,
        tone: overdue > 0 ? ('danger' as const) : ('neutral' as const),
      },
    ]
  }, [tasks])

  const header = (
    <PageHeader
      eyebrow="Assigned to you"
      title="My tasks"
      description="Every task assigned to you across all of your projects."
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
        <StatsSkeleton />
        <TableSkeleton rows={5} columns={4} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          title="Unable to load your tasks"
          description={loadError}
          onRetry={() => void load()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {tasks.length > 0 && (
        <section aria-label="Task summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(metric => (
            <StatCard key={metric.label} {...metric} />
          ))}
        </section>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks assigned"
          description="When a project manager assigns you work, it will show up here."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/projects">Browse projects</Link>
            </Button>
          }
        />
      ) : (
        <Card elevation="xs" className="overflow-hidden">
          <div className="border-b bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </p>
          </div>
          <ul className="divide-y">
            {tasks.map(task => {
              const overdue = isOverdue(task)
              return (
                <li key={task.id} className="group transition-colors hover:bg-accent/30">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <PriorityRail priority={task.priority} className="mt-1 h-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">
                        {typeof task.projectId === 'object' ? task.projectId.name : task.projectId}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {task.taskKey && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {task.taskKey}
                          </span>
                        )}
                        <Link
                          to={`/tasks/${task.id}`}
                          className="truncate text-sm font-medium transition-colors group-hover:text-primary"
                        >
                          {task.title}
                        </Link>
                        {task.requiresGitHubEvidence && (
                          <Badge variant="info" size="sm">
                            Evidence required
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <StatusBadge status={task.status} size="sm" />
                        <PriorityBadge priority={task.priority} size="sm" />
                        {task.dueDate && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs',
                              overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                            )}
                          >
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {overdue ? 'Overdue' : 'Due'} {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      onChange={event =>
                        void updateStatus(task, event.target.value as ApiTask['status'])
                      }
                      className="h-8 w-[8.5rem] shrink-0 text-xs"
                    >
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="ready_for_review" disabled>
                        Ready for review
                      </option>
                      <option value="changes_requested" disabled>
                        Changes requested
                      </option>
                      <option value="done" disabled>
                        Done (review required)
                      </option>
                    </Select>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
