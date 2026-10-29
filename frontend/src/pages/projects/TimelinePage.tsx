import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, CalendarRange, Search, Workflow } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { ApiTask, fetchAllPages } from '@/lib/api'
import { joinProjectRoom, onTaskEvent } from '@/lib/socket'
import {
  getTimelineBar,
  getTimelineDateAtUnit,
  getTimelineRange,
  getTimelineUnitCount,
  getTodayOffset,
  TimelineScale,
} from '@/lib/timeline'
import { cn, formatDate, formatStatus } from '@/lib/utils'

const taskColumnWidth = 280

function isOverdue(task: ApiTask, now: Date): boolean {
  return Boolean(
    task.dueDate && task.status !== 'done' && new Date(task.dueDate).getTime() < now.getTime()
  )
}

/** Bar colour follows the same semantic scale as status and priority badges. */
function barColor(task: ApiTask, overdue: boolean): string {
  if (overdue) return 'bg-destructive text-destructive-foreground'
  if (task.status === 'done') return 'bg-success text-success-foreground'
  if (task.status === 'blocked') return 'bg-warning text-warning-foreground'
  if (task.priority === 'urgent') return 'bg-destructive/80 text-destructive-foreground'
  return 'bg-info text-info-foreground'
}

export function TimelinePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [scale, setScale] = useState<TimelineScale>('week')
  const [filters, setFilters] = useState({ search: '', status: '', priority: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    if (!projectId) return
    const params = new URLSearchParams({ sort: 'createdAt', order: 'asc' })
    if (filters.search.trim()) params.set('search', filters.search.trim())
    if (filters.status) params.set('status', filters.status)
    if (filters.priority) params.set('priority', filters.priority)
    let active = true
    setIsLoading(true)
    void fetchAllPages<ApiTask>(`/api/tasks/project/${projectId}?${params.toString()}`)
      .then(result => {
        if (active) {
          setTasks(result || [])
          setError('')
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (!active) return
        setError('Unable to load project timeline.')
        setIsLoading(false)
        addToast({ title: 'Timeline unavailable', description: 'Please try again.', type: 'error' })
      })
    return () => {
      active = false
    }
  }, [projectId, filters.search, filters.status, filters.priority, refreshKey])

  useEffect(() => {
    if (!projectId) return
    const leave = joinProjectRoom(projectId)
    let refreshTimer: number | undefined
    const stop = onTaskEvent(event => {
      if (event.projectId !== projectId || event.attachmentChanged) return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        setRefreshKey(current => current + 1)
      }, 100)
    })
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      stop()
      leave()
    }
  }, [projectId])

  const now = new Date()
  const range = useMemo(() => getTimelineRange(tasks, now), [tasks])
  const unitCount = getTimelineUnitCount(range, scale)
  const unitWidth = scale === 'week' ? 62 : 38
  const timelineWidth = unitCount * unitWidth
  const todayOffset = getTodayOffset(range, scale, now)
  const ticks = Array.from({ length: unitCount }, (_, index) =>
    getTimelineDateAtUnit(range, index, scale)
  )
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ),
    [tasks]
  )

  if (!projectId)
    return (
      <EmptyState title="Project not found" description="This project may have been deleted." />
    )

  const hasActiveFilters = Boolean(filters.search.trim() || filters.status || filters.priority)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', to: '/projects' },
          { label: 'Project', to: `/projects/${projectId}` },
          { label: 'Timeline' },
        ]}
        title="Timeline"
        description="Task bars run from creation date to due date. Tasks without a due date show a single day."
        actions={
          <div
            className="inline-flex rounded-md border bg-card p-0.5 shadow-xs"
            aria-label="Timeline scale"
          >
            <Button
              type="button"
              size="sm"
              variant={scale === 'week' ? 'secondary' : 'ghost'}
              aria-pressed={scale === 'week'}
              onClick={() => setScale('week')}
            >
              Week
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scale === 'month' ? 'secondary' : 'ghost'}
              aria-pressed={scale === 'month'}
              onClick={() => setScale('month')}
            >
              Month
            </Button>
          </div>
        }
      />

      <ProjectTabs projectId={projectId} active="timeline" />

      <Card elevation="xs" className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            type="search"
            label="Search"
            value={filters.search}
            onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
            placeholder="Task title"
            leftIcon={<Search />}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </Select>
          <Select
            label="Priority"
            value={filters.priority}
            onChange={event =>
              setFilters(current => ({ ...current, priority: event.target.value }))
            }
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading project timeline..." />
      ) : error ? (
        <ErrorState
          title="Unable to load project timeline"
          description="Please try again."
          onRetry={() => setRefreshKey(current => current + 1)}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={hasActiveFilters ? 'No tasks match these filters' : 'No tasks to schedule'}
          description={
            hasActiveFilters
              ? 'Try widening the filters to see more work.'
              : 'Create tasks with due dates to build a schedule.'
          }
          action={
            hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({ search: '', status: '', priority: '' })}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link to={`/projects/${projectId}/tasks?create=1`}>Create task</Link>
              </Button>
            )
          }
        />
      ) : (
        <Card elevation="xs" className="scrollbar-slim overflow-x-auto">
          <div
            className="relative"
            style={{ width: taskColumnWidth + timelineWidth, minWidth: '100%' }}
          >
            <div
              className="grid border-b bg-muted/40"
              style={{ gridTemplateColumns: `${taskColumnWidth}px ${timelineWidth}px` }}
            >
              <div className="sticky left-0 z-20 flex items-center gap-2 border-r bg-muted px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Task
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${unitCount}, ${unitWidth}px)` }}
              >
                {ticks.map((date, index) => (
                  <div
                    key={index}
                    className="border-l px-1 py-2.5 text-center text-2xs text-muted-foreground"
                  >
                    {scale === 'week'
                      ? new Intl.DateTimeFormat(undefined, {
                          weekday: 'short',
                          day: '2-digit',
                        }).format(date)
                      : new Intl.DateTimeFormat(undefined, {
                          month: 'short',
                          day: '2-digit',
                        }).format(date)}
                  </div>
                ))}
              </div>
            </div>

            {sortedTasks.map(task => {
              const bar = getTimelineBar(task, range, scale)
              const overdue = isOverdue(task, now)
              const assignee =
                typeof task.assigneeId === 'object' ? task.assigneeId.name : undefined
              const barWidth = Math.max(32, bar.widthUnits * unitWidth)

              return (
                <div
                  key={task.id}
                  className="group grid min-h-16 border-b last:border-b-0"
                  style={{ gridTemplateColumns: `${taskColumnWidth}px ${timelineWidth}px` }}
                >
                  <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center border-r bg-card px-3 py-2 transition-colors group-hover:bg-accent/30">
                    <Link
                      to={`/tasks/${task.id}`}
                      className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium hover:text-primary"
                    >
                      {task.taskKey && (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {task.taskKey}
                        </span>
                      )}
                      <span className="truncate">{task.title}</span>
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground">
                      <span>{formatStatus(task.status)}</span>
                      <span aria-hidden>·</span>
                      <span>{formatStatus(task.priority || 'medium')}</span>
                      {assignee && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{assignee}</span>
                        </>
                      )}
                      {Boolean(task.dependencies?.length) && (
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <Workflow className="h-3 w-3" />
                          {task.dependencies!.length}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    className="relative h-16 transition-colors group-hover:bg-accent/20"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)',
                      backgroundSize: `${unitWidth}px 100%`,
                    }}
                  >
                    {overdue && (
                      <span className="absolute left-1 top-1 z-10 inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-2xs font-medium text-destructive-foreground">
                        <AlertCircle className="h-3 w-3" />
                        Overdue
                      </span>
                    )}
                    <Link
                      to={`/tasks/${task.id}`}
                      title={`${task.title}: ${formatDate(task.createdAt)} – ${
                        task.dueDate ? formatDate(task.dueDate) : 'No due date'
                      }`}
                      className={cn(
                        'absolute top-1/2 z-[1] flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-md px-2 text-left text-2xs font-medium shadow-xs transition-all hover:shadow-md',
                        barColor(task, overdue)
                      )}
                      style={{ left: bar.leftUnits * unitWidth, width: barWidth }}
                    >
                      {barWidth > 100 ? task.taskKey || task.title : ''}
                    </Link>
                  </div>
                </div>
              )
            })}

            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary"
              style={{ left: taskColumnWidth + todayOffset * unitWidth }}
            >
              <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground">
                Today
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
