import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  GripVertical,
  Lock,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { PriorityRail } from '@/components/tasks/TaskBadges'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { useToast } from '@/components/ui/Toast'
import { ApiProject, ApiTask, updateTaskStatus, apiRequest, fetchAllPages } from '@/lib/api'
import { joinProjectRoom, onTaskEvent } from '@/lib/socket'
import { cn, formatDate } from '@/lib/utils'

type KanbanStatus = ApiTask['status']

/**
 * Review-gated columns cannot receive a dragged card: those transitions belong
 * to the Proof of Work workflow, not to drag and drop.
 */
const columns: {
  status: KanbanStatus
  label: string
  accent: string
  dot: string
  reviewGated?: boolean
}[] = [
  {
    status: 'todo',
    label: 'To do',
    accent: 'bg-muted-foreground/40',
    dot: 'bg-muted-foreground/50',
  },
  { status: 'in_progress', label: 'In progress', accent: 'bg-info', dot: 'bg-info' },
  { status: 'blocked', label: 'Blocked', accent: 'bg-destructive', dot: 'bg-destructive' },
  {
    status: 'ready_for_review',
    label: 'Ready for review',
    accent: 'bg-warning',
    dot: 'bg-warning',
    reviewGated: true,
  },
  {
    status: 'changes_requested',
    label: 'Changes requested',
    accent: 'bg-warning/70',
    dot: 'bg-warning/70',
    reviewGated: true,
  },
  { status: 'done', label: 'Done', accent: 'bg-success', dot: 'bg-success', reviewGated: true },
]

export function KanbanPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [project, setProject] = useState<ApiProject | null>(null)
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState({ search: '', priority: '', assigneeId: '', due: 'all' })
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<KanbanStatus | null>(null)
  const { addToast } = useToast()

  const projectMembers = useMemo(
    () =>
      (project?.members || []).map(member => {
        const user = typeof member.userId === 'object' ? member.userId : undefined
        return { id: user?.id || String(member.userId), name: user?.name || 'Unknown member' }
      }),
    [project]
  )

  const load = async () => {
    if (!projectId) return
    setIsLoading(true)
    setLoadError('')
    try {
      const params = new URLSearchParams({ sort: 'createdAt', order: 'asc' })
      if (filters.search.trim()) params.set('search', filters.search.trim())
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
      if (filters.due === 'overdue') params.set('overdue', 'true')
      if (filters.due === 'upcoming') params.set('dueAfter', new Date().toISOString())
      const [projectResult, taskResult] = await Promise.all([
        apiRequest<ApiProject>(`/api/projects/${projectId}`),
        fetchAllPages<ApiTask>(`/api/tasks/project/${projectId}?${params.toString()}`),
      ])
      setProject(projectResult)
      setTasks(taskResult || [])
    } catch {
      setLoadError('Unable to load the task board. Please try again.')
      addToast({ title: 'Unable to load board', description: 'Please try again.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [projectId, filters.search, filters.priority, filters.assigneeId, filters.due])

  useEffect(() => {
    if (!projectId) return
    const leave = joinProjectRoom(projectId)
    let refreshTimer: number | undefined
    const stop = onTaskEvent(payload => {
      if (payload.projectId !== projectId || payload.attachmentChanged) return
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
  }, [projectId])

  const moveTask = async (status: KanbanStatus) => {
    setDragOverStatus(null)
    if (!draggedTaskId) return
    const task = tasks.find(item => item.id === draggedTaskId)
    setDraggedTaskId(null)
    if (!task || task.status === status) return
    if (status === 'done' || status === 'ready_for_review' || status === 'changes_requested') {
      addToast({
        title: 'Use Proof of Work',
        description:
          status === 'done'
            ? 'Only an owner or manager can complete a task after reviewing proof.'
            : 'Submit or review proof from the task details page.',
        type: 'error',
      })
      return
    }

    setTasks(current => current.map(item => (item.id === task.id ? { ...item, status } : item)))
    try {
      await updateTaskStatus(task.id, status)
    } catch (error: any) {
      setTasks(current =>
        current.map(item => (item.id === task.id ? { ...item, status: task.status } : item))
      )
      addToast({ title: 'Task could not be moved', description: error.message, type: 'error' })
    }
  }

  const isOverdue = (task: ApiTask) =>
    Boolean(task.dueDate && task.status !== 'done' && new Date(task.dueDate).getTime() < Date.now())
  const hasActiveFilters = Boolean(
    filters.search.trim() || filters.priority || filters.assigneeId || filters.due !== 'all'
  )

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', to: '/projects' },
          {
            label: project?.name || 'Project',
            to: projectId ? `/projects/${projectId}` : undefined,
          },
          { label: 'Kanban' },
        ]}
        title="Kanban board"
        description="Drag cards between To do, In progress, and Blocked. Review states are set through Proof of Work."
      />

      {projectId && <ProjectTabs projectId={projectId} active="kanban" />}

      <Card elevation="xs" className="p-4">
        <div className="flex items-center gap-2 pb-3">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Filters
          </h2>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              onClick={() => setFilters({ search: '', priority: '', assigneeId: '', due: 'all' })}
            >
              <X aria-hidden />
              Clear
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="search"
            label="Search"
            value={filters.search}
            onChange={event => setFilters({ ...filters, search: event.target.value })}
            placeholder="Title or description"
            leftIcon={<Search />}
          />
          <Select
            label="Priority"
            value={filters.priority}
            onChange={event => setFilters({ ...filters, priority: event.target.value })}
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select
            label="Assignee"
            value={filters.assigneeId}
            onChange={event => setFilters({ ...filters, assigneeId: event.target.value })}
          >
            <option value="">Everyone</option>
            {projectMembers.map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
          <Select
            label="Due date"
            value={filters.due}
            onChange={event => setFilters({ ...filters, due: event.target.value })}
          >
            <option value="all">Any date</option>
            <option value="upcoming">Upcoming</option>
            <option value="overdue">Overdue</option>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading task board..." />
      ) : loadError ? (
        <ErrorState
          title="Unable to load task board"
          description={loadError}
          onRetry={() => void load()}
        />
      ) : (
        <div className="scrollbar-slim -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {columns.map(column => {
            const columnTasks = tasks.filter(task => task.status === column.status)
            const isDropTarget = dragOverStatus === column.status
            const isBlockedTarget = isDropTarget && column.reviewGated

            return (
              <section
                key={column.status}
                aria-label={`${column.label} column`}
                onDragOver={event => {
                  event.preventDefault()
                  if (draggedTaskId) setDragOverStatus(column.status)
                }}
                onDragLeave={() =>
                  setDragOverStatus(current => (current === column.status ? null : current))
                }
                onDrop={() => void moveTask(column.status)}
                className={cn(
                  'flex w-[17.5rem] shrink-0 snap-start flex-col rounded-lg border bg-muted/30 transition-colors',
                  isDropTarget && !column.reviewGated && 'border-primary/50 bg-primary-soft/40',
                  isBlockedTarget && 'border-destructive/40 bg-destructive-soft/30'
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', column.dot)} aria-hidden />
                    <h2 className="truncate text-sm font-semibold">{column.label}</h2>
                    {column.reviewGated && (
                      <Lock
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        aria-label="Set through Proof of Work review"
                      />
                    )}
                  </div>
                  <Badge variant="secondary" size="sm">
                    {columnTasks.length}
                  </Badge>
                </div>

                <div className="flex min-h-[20rem] flex-1 flex-col gap-2 p-2.5">
                  {columnTasks.map(task => {
                    const assignee =
                      typeof task.assigneeId === 'object' ? task.assigneeId : undefined
                    const completedSubtasks =
                      task.subtasks?.filter(subtask => subtask.completed).length || 0
                    const completedDependencies =
                      task.dependencies?.filter(dependency => dependency.status === 'done')
                        .length || 0
                    const overdue = isOverdue(task)

                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => {
                          setDraggedTaskId(null)
                          setDragOverStatus(null)
                        }}
                        className={cn(
                          'group cursor-grab rounded-md border bg-card p-3 shadow-xs transition-all hover:border-primary/35 hover:shadow-md active:cursor-grabbing',
                          draggedTaskId === task.id && 'opacity-50'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <PriorityRail priority={task.priority} className="mt-0.5 h-8" />
                          <div className="min-w-0 flex-1">
                            {task.taskKey && (
                              <span className="block font-mono text-2xs text-muted-foreground">
                                {task.taskKey}
                              </span>
                            )}
                            <Link
                              to={`/tasks/${task.id}`}
                              className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-primary"
                            >
                              {task.title}
                            </Link>
                          </div>
                          <GripVertical
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
                            aria-hidden
                          />
                        </div>

                        {(task.dueDate || task.subtasks?.length || task.dependencies?.length) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-3 text-2xs">
                            {task.dueDate && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1',
                                  overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                                )}
                              >
                                <CalendarDays className="h-3 w-3" aria-hidden />
                                {overdue ? 'Overdue' : formatDate(task.dueDate)}
                              </span>
                            )}
                            {task.subtasks && task.subtasks.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Check className="h-3 w-3" aria-hidden />
                                {completedSubtasks}/{task.subtasks.length}
                              </span>
                            )}
                            {task.dependencies && task.dependencies.length > 0 && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1',
                                  completedDependencies === task.dependencies.length
                                    ? 'text-success'
                                    : 'text-warning'
                                )}
                              >
                                {completedDependencies === task.dependencies.length ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <AlertCircle className="h-3 w-3" />
                                )}
                                {completedDependencies}/{task.dependencies.length}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
                          {task.requiresGitHubEvidence ? (
                            <Badge variant="info" size="sm">
                              Evidence
                            </Badge>
                          ) : (
                            <span />
                          )}
                          {assignee ? (
                            <Avatar name={assignee.name} src={assignee.avatarUrl} size="xs" />
                          ) : (
                            <span className="text-2xs text-muted-foreground">Unassigned</span>
                          )}
                        </div>
                      </article>
                    )
                  })}

                  {columnTasks.length === 0 && (
                    <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      {column.reviewGated ? 'Set through review' : 'Drop tasks here'}
                    </p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
