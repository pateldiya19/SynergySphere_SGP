import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ListChecks,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States'
import { PriorityBadge, PriorityRail, StatusBadge } from '@/components/tasks/TaskBadges'
import { useToast } from '@/components/ui/Toast'
import { ApiPagination, apiRequest, ApiProject, ApiSubtask, ApiTask, fetchPage } from '@/lib/api'
import { LoadMore } from '@/components/ui/LoadMore'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { joinProjectRoom, onTaskEvent } from '@/lib/socket'
import { cn, formatDate } from '@/lib/utils'

export function TasksPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const PAGE_SIZE = 25
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [pagination, setPagination] = useState<ApiPagination>()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [project, setProject] = useState<ApiProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(
    () => new URLSearchParams(window.location.search).get('create') === '1'
  )
  const [form, setForm] = useState<{
    title: string
    description: string
    assigneeId: string
    dueDate: string
    priority: 'low' | 'medium' | 'high' | 'urgent'
    requiresGitHubEvidence: boolean
    subtasks: ApiSubtask[]
  }>({
    title: '',
    description: '',
    assigneeId: '',
    dueDate: '',
    priority: 'medium',
    requiresGitHubEvidence: false,
    subtasks: [],
  })
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [filters, setFilters] = useState(() => ({
    search: '',
    status: new URLSearchParams(window.location.search).get('status') || '',
    priority: '',
    assigneeId: '',
    due: 'all',
    sort: 'createdAt',
    order: 'desc',
  }))
  const { addToast } = useToast()

  const projectMembers = useMemo(() => {
    if (!project?.members) return []

    return project.members
      .map(member => {
        const user = typeof member.userId === 'object' ? member.userId : null
        const userId = user?.id ?? (typeof member.userId === 'string' ? member.userId : '')
        if (!userId) return null
        return {
          userId,
          name: user?.name || 'Unknown member',
          email: user?.email || '',
          role: member.role,
        }
      })
      .filter(Boolean) as {
      userId: string
      name: string
      email: string
      role: 'owner' | 'manager' | 'member'
    }[]
  }, [project])

  const buildTaskQuery = () => {
    const params = new URLSearchParams()
    if (filters.search.trim()) params.set('search', filters.search.trim())
    if (filters.status) params.set('status', filters.status)
    if (filters.priority) params.set('priority', filters.priority)
    if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
    if (filters.due === 'overdue') params.set('overdue', 'true')
    if (filters.due === 'upcoming') params.set('dueAfter', new Date().toISOString())
    params.set('sort', filters.sort)
    params.set('order', filters.order)
    return params.toString()
  }

  const loadTasks = async () => {
    if (!projectId) return
    setIsLoading(true)
    setLoadError('')
    try {
      const [projectResult, result] = await Promise.all([
        apiRequest<ApiProject>(`/api/projects/${projectId}`),
        fetchPage<ApiTask>(`/api/tasks/project/${projectId}?${buildTaskQuery()}`, 1, PAGE_SIZE),
      ])
      setProject(projectResult)
      setTasks(result.items)
      setPagination(result.pagination)
    } catch {
      setLoadError('Unable to load tasks. Please try again.')
      addToast({ title: 'Unable to load tasks', description: 'Please try again.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const loadMoreTasks = async () => {
    if (!projectId) return
    const nextPage = (pagination?.page ?? 1) + 1
    setIsLoadingMore(true)
    try {
      const { items, pagination: meta } = await fetchPage<ApiTask>(
        `/api/tasks/project/${projectId}?${buildTaskQuery()}`,
        nextPage,
        PAGE_SIZE
      )
      setTasks(current => {
        const seen = new Set(current.map(task => task.id))
        return [...current, ...items.filter(task => !seen.has(task.id))]
      })
      setPagination(meta)
    } catch {
      addToast({
        title: 'Unable to load more tasks',
        description: 'Please try again.',
        type: 'error',
      })
    } finally {
      setIsLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [
    projectId,
    filters.search,
    filters.status,
    filters.priority,
    filters.assigneeId,
    filters.due,
    filters.sort,
    filters.order,
  ])

  useEffect(() => {
    if (!projectId) return
    const leave = joinProjectRoom(projectId)
    let refreshTimer: number | undefined
    const stop = onTaskEvent(payload => {
      if (payload.projectId !== projectId || payload.attachmentChanged) return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined
        void loadTasks()
      }, 100)
    })
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      stop()
      leave()
    }
  }, [projectId])

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!projectId) return
    setIsSaving(true)
    try {
      await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          projectId,
          assigneeId: form.assigneeId || undefined,
          dueDate: form.dueDate || undefined,
        }),
      })
      setForm({
        title: '',
        description: '',
        assigneeId: '',
        dueDate: '',
        priority: 'medium',
        requiresGitHubEvidence: false,
        subtasks: [],
      })
      setSubtaskTitle('')
      setIsModalOpen(false)
      await loadTasks()
      addToast({
        title: 'Task created',
        description: 'The task was added to the project.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Task could not be created', description: error.message, type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

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
      await loadTasks()
    } catch (error: any) {
      addToast({ title: 'Status could not be updated', description: error.message, type: 'error' })
    }
  }

  const updateAssignee = async (task: ApiTask, assigneeId?: string) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      })
      await loadTasks()
      addToast({
        title: 'Task reassigned',
        description: assigneeId ? 'The assignee was updated.' : 'The task is now unassigned.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({
        title: 'Assignee could not be updated',
        description: error.message,
        type: 'error',
      })
    }
  }

  const updateSubtasks = async (task: ApiTask, subtasks: ApiSubtask[]) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ subtasks }),
      })
      setTasks(current => current.map(item => (item.id === task.id ? { ...item, subtasks } : item)))
    } catch (error: any) {
      addToast({
        title: 'Checklist could not be updated',
        description: error.message,
        type: 'error',
      })
    }
  }

  const addSubtask = () => {
    const title = subtaskTitle.trim()
    if (!title) return
    setForm(current => ({
      ...current,
      subtasks: [...current.subtasks, { title, completed: false }],
    }))
    setSubtaskTitle('')
  }

  const isOverdue = (task: ApiTask) =>
    Boolean(task.dueDate && task.status !== 'done' && new Date(task.dueDate).getTime() < Date.now())

  const deleteTask = async (id: string) => {
    try {
      await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' })
      setTasks(current => current.filter(task => task.id !== id))
    } catch (error: any) {
      addToast({ title: 'Task could not be deleted', description: error.message, type: 'error' })
    }
  }

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.status ||
      filters.priority ||
      filters.assigneeId ||
      filters.due !== 'all'
  )
  const resetFilters = () =>
    setFilters(current => ({
      ...current,
      search: '',
      status: '',
      priority: '',
      assigneeId: '',
      due: 'all',
    }))

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', to: '/projects' },
          {
            label: project?.name || 'Project',
            to: projectId ? `/projects/${projectId}` : undefined,
          },
          { label: 'Tasks' },
        ]}
        title="Tasks"
        description="Assign work, track status, and keep the review queue moving."
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus aria-hidden />
            New task
          </Button>
        }
      />

      {projectId && <ProjectTabs projectId={projectId} active="tasks" />}

      <Card elevation="xs" className="p-4">
        <div className="flex items-center gap-2 pb-3">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Filters
          </h2>
          {hasActiveFilters && (
            <Button variant="ghost" size="xs" className="ml-auto" onClick={resetFilters}>
              <X aria-hidden />
              Clear
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <Input
              type="search"
              label="Search"
              value={filters.search}
              onChange={event => setFilters({ ...filters, search: event.target.value })}
              placeholder="Title or description"
              leftIcon={<Search />}
            />
          </div>
          <Select
            label="Status"
            value={filters.status}
            onChange={event => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">All statuses</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="ready_for_review">Ready for review</option>
            <option value="changes_requested">Changes requested</option>
            <option value="done">Done</option>
          </Select>
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
              <option key={member.userId} value={member.userId}>
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
          <Select
            label="Sort by"
            value={filters.sort}
            onChange={event => setFilters({ ...filters, sort: event.target.value })}
          >
            <option value="createdAt">Created</option>
            <option value="priority">Priority</option>
            <option value="dueDate">Due date</option>
            <option value="status">Status</option>
            <option value="title">Title</option>
          </Select>
          <Select
            label="Order"
            value={filters.order}
            onChange={event => setFilters({ ...filters, order: event.target.value })}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : loadError ? (
        <ErrorState
          title="Unable to load tasks"
          description={loadError}
          onRetry={() => void loadTasks()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={hasActiveFilters ? 'No tasks match these filters' : 'No tasks yet'}
          description={
            hasActiveFilters
              ? 'Try widening or clearing the filters to see more work.'
              : 'Create a task to start tracking project work.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Create task
              </Button>
            )
          }
        />
      ) : (
        <Card elevation="xs" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              {pagination?.total ?? tasks.length}{' '}
              {(pagination?.total ?? tasks.length) === 1 ? 'task' : 'tasks'}
            </p>
          </div>
          <ul className="divide-y">
            {tasks.map(task => {
              const assigneeId =
                typeof task.assigneeId === 'object' ? task.assigneeId?.id : task.assigneeId || ''
              const assigneeName =
                typeof task.assigneeId === 'object' ? task.assigneeId?.name : undefined
              const overdue = isOverdue(task)
              const completedSubtasks =
                task.subtasks?.filter(subtask => subtask.completed).length || 0
              const dependenciesDone = task.dependencies?.every(
                dependency => dependency.status === 'done'
              )

              return (
                <li key={task.id} className="group transition-colors hover:bg-accent/30">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <PriorityRail priority={task.priority} className="mt-1 h-9" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                        <StatusBadge status={task.status} size="sm" />
                        <PriorityBadge priority={task.priority} size="sm" />

                        {task.dueDate && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1',
                              overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                            )}
                          >
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {overdue ? 'Overdue' : 'Due'} {formatDate(task.dueDate)}
                          </span>
                        )}

                        {task.dependencies && task.dependencies.length > 0 && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1',
                              dependenciesDone ? 'text-success' : 'text-warning'
                            )}
                          >
                            {dependenciesDone ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            {
                              task.dependencies.filter(dependency => dependency.status === 'done')
                                .length
                            }
                            /{task.dependencies.length} dependencies
                          </span>
                        )}

                        {task.subtasks && task.subtasks.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Check className="h-3 w-3" aria-hidden />
                            {completedSubtasks}/{task.subtasks.length} checklist
                          </span>
                        )}
                      </div>

                      {task.subtasks && task.subtasks.length > 0 && (
                        <details className="group/checklist mt-2">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                            Checklist
                            <span
                              className="transition-transform group-open/checklist:rotate-180"
                              aria-hidden
                            >
                              ▾
                            </span>
                          </summary>
                          <ul className="mt-2 space-y-1.5 border-l pl-3">
                            {task.subtasks.map((subtask, index) => (
                              <li key={subtask.id || `${task.id}-${index}`}>
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={subtask.completed}
                                    className="h-3.5 w-3.5 rounded border-input"
                                    onChange={event => {
                                      const subtasks = task.subtasks!.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, completed: event.target.checked }
                                          : item
                                      )
                                      void updateSubtasks(task, subtasks)
                                    }}
                                  />
                                  <span
                                    className={cn(
                                      subtask.completed && 'text-muted-foreground line-through'
                                    )}
                                  >
                                    {subtask.title}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>

                    {/* Inline controls: quick status / assignee changes without leaving the list. */}
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                      {assigneeName && (
                        <Avatar name={assigneeName} size="xs" className="hidden sm:inline-flex" />
                      )}
                      <Select
                        aria-label={`Assignee for ${task.title}`}
                        value={assigneeId}
                        onChange={event =>
                          void updateAssignee(task, event.target.value || undefined)
                        }
                        className="h-8 w-[8.5rem] text-xs"
                      >
                        <option value="">
                          {projectMembers.length ? 'Unassigned' : 'No members'}
                        </option>
                        {projectMembers.map(member => (
                          <option key={member.userId} value={member.userId}>
                            {member.name}
                          </option>
                        ))}
                      </Select>
                      <Select
                        aria-label={`Status for ${task.title}`}
                        value={task.status}
                        onChange={event =>
                          void updateStatus(task, event.target.value as ApiTask['status'])
                        }
                        className="h-8 w-[8.5rem] text-xs"
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
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${task.title}`}
                        onClick={() => void deleteTask(task.id)}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <LoadMore
            pagination={pagination}
            loaded={tasks.length}
            isLoading={isLoadingMore}
            onLoadMore={() => void loadMoreTasks()}
            noun="task"
          />
        </Card>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create task"
        description="Describe the work, set ownership, and decide whether GitHub evidence is required."
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-task-form" loading={isSaving}>
              Create task
            </Button>
          </>
        }
      >
        <form id="create-task-form" onSubmit={createTask} className="space-y-4">
          <Input
            label="Title"
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })}
            placeholder="Implement the search endpoint"
            required
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            rows={3}
            placeholder="What needs to happen?"
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-muted/30 p-3.5 text-sm transition-colors hover:bg-muted/50">
            <input
              type="checkbox"
              checked={form.requiresGitHubEvidence}
              onChange={event => setForm({ ...form, requiresGitHubEvidence: event.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="font-medium">Require GitHub evidence</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                A reviewer can only approve this task once the GitHub webhook has verified a
                matching commit or pull request.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Assignee"
              value={form.assigneeId}
              onChange={event => setForm({ ...form, assigneeId: event.target.value })}
            >
              <option value="">
                {projectMembers.length ? 'Unassigned' : 'No project members available'}
              </option>
              {projectMembers.map(member => (
                <option key={member.userId} value={member.userId}>
                  {member.name} ({member.email}){member.role === 'owner' ? ' (Owner)' : ''}
                </option>
              ))}
            </Select>
            <Select
              label="Priority"
              value={form.priority}
              onChange={event =>
                setForm({ ...form, priority: event.target.value as typeof form.priority })
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>

          <Input
            label="Due date"
            type="date"
            value={form.dueDate}
            onChange={event => setForm({ ...form, dueDate: event.target.value })}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="new-subtask">
              Checklist
            </label>
            <div className="flex gap-2">
              <Input
                id="new-subtask"
                value={subtaskTitle}
                onChange={event => setSubtaskTitle(event.target.value)}
                placeholder="Add a checklist item"
                className="flex-1"
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addSubtask()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Add checklist item"
                onClick={addSubtask}
              >
                <Plus />
              </Button>
            </div>
            {form.subtasks.length > 0 && (
              <ul className="space-y-1 rounded-md border bg-muted/30 p-2">
                {form.subtasks.map((subtask, index) => (
                  <li
                    key={`${subtask.title}-${index}`}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${subtask.title}`}
                      onClick={() =>
                        setForm(current => ({
                          ...current,
                          subtasks: current.subtasks.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}
