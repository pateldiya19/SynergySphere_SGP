import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Github,
  Link2Off,
  Plus,
  Search,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { PriorityBadge, StatusBadge } from '@/components/tasks/TaskBadges'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import {
  apiRequest,
  ApiInvitation,
  ApiProject,
  ApiProjectHealth,
  ApiTask,
  ApiUser,
  cancelProjectInvitation,
  fetchAllPages,
  getProjectHealth,
  getProjectInvitations,
  sendProjectInvitation,
} from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { joinProjectRoom, onPresenceChanged, onPresenceState, onTaskEvent } from '@/lib/socket'
import { ProjectActivityTimeline } from '@/components/projects/ProjectActivityTimeline'
import { cn, formatCount, formatDateTime } from '@/lib/utils'

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ApiProject | null>(null)
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [health, setHealth] = useState<ApiProjectHealth | null>(null)
  const [email, setEmail] = useState('')
  const [availableUser, setAvailableUser] = useState<ApiUser | null>(null)
  const [pendingInvitations, setPendingInvitations] = useState<ApiInvitation[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSearchingUser, setIsSearchingUser] = useState(false)
  const [isRemovingMember, setIsRemovingMember] = useState<string | null>(null)
  const [isCancellingInvitation, setIsCancellingInvitation] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [githubOwner, setGithubOwner] = useState('')
  const [githubName, setGithubName] = useState('')
  const githubDetailsRef = useRef<HTMLDetailsElement>(null)
  const [webhookUrl, setWebhookUrl] = useState(
    `${import.meta.env.VITE_API_BASE_URL || window.location.origin}/api/github/webhook`
  )
  const [isGithubSaving, setIsGithubSaving] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const { addToast } = useToast()
  const { user: currentUser } = useAuth()

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    setLoadError('')
    try {
      const [projectResult, taskResult] = await Promise.all([
        apiRequest<ApiProject>(`/api/projects/${id}`),
        fetchAllPages<ApiTask>(`/api/tasks/project/${id}`),
      ])
      setProject(projectResult)
      setTasks(taskResult || [])
      setGithubOwner(projectResult.github?.owner || '')
      setGithubName(projectResult.github?.name || '')
      const ownerId =
        typeof projectResult.ownerId === 'string' ? projectResult.ownerId : projectResult.ownerId.id
      const currentMember = projectResult.members?.find(member => {
        const memberId = typeof member.userId === 'string' ? member.userId : member.userId.id
        return memberId === currentUser?.id
      })
      setPendingInvitations(
        currentUser?.id === ownerId || currentMember?.role === 'manager'
          ? await getProjectInvitations(id)
          : []
      )
    } catch {
      setLoadError('Unable to load this project. Please try again.')
      addToast({ title: 'Unable to load project', description: 'Please try again.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    if (!id) return
    let active = true
    void getProjectHealth(id)
      .then(result => {
        if (active) setHealth(result)
      })
      .catch(() => {
        if (active) setHealth(null)
      })
    return () => {
      active = false
    }
  }, [id, tasks])

  useEffect(() => {
    void fetch('/api/github/webhook-config')
      .then(response => response.json())
      .then(payload => {
        if (typeof payload?.data?.url === 'string' && payload.data.url)
          setWebhookUrl(payload.data.url)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) return
    const leave = joinProjectRoom(id)
    const stopPresence = onPresenceState(payload => {
      if (payload.projectId !== id) return
      setOnlineUserIds(new Set(payload.users.map(onlineUser => onlineUser.id)))
    })
    const stopPresenceChanges = onPresenceChanged(payload => {
      if (payload.projectId !== id) return
      setOnlineUserIds(current => {
        const next = new Set(current)
        if (payload.online) next.add(payload.user.id)
        else next.delete(payload.user.id)
        return next
      })
    })
    const stopTaskEvents = onTaskEvent(payload => {
      if (payload.projectId !== id || payload.attachmentChanged) return
      const updatedTask = payload.task as ApiTask | undefined
      const taskId = String(updatedTask?.id || payload.taskId || '')
      setTasks(current => {
        if (updatedTask) {
          const existingIndex = current.findIndex(task => task.id === updatedTask.id)
          if (existingIndex < 0) return [...current, updatedTask]
          return current.map(task =>
            task.id === updatedTask.id ? { ...task, ...updatedTask } : task
          )
        }
        return taskId ? current.filter(task => task.id !== taskId) : current
      })
    })
    return () => {
      stopPresence()
      stopPresenceChanges()
      stopTaskEvents()
      leave()
    }
  }, [id])

  const searchAvailableUser = async () => {
    if (!email.trim()) return
    setIsSearchingUser(true)
    setAvailableUser(null)
    try {
      const matches = await apiRequest<ApiUser[]>(
        `/api/users/search?email=${encodeURIComponent(email.trim())}`
      )
      const user = matches[0]
      if (!user) throw new Error('User not found')

      const alreadyMember = project?.members?.some(member => {
        const memberUser = typeof member.userId === 'object' ? member.userId : null
        const memberId = memberUser ? memberUser.id : String(member.userId)
        return memberId === user.id || memberUser?.email?.toLowerCase() === user.email.toLowerCase()
      })

      if (alreadyMember) {
        throw new Error('This user is already a member of the project.')
      }
      if (
        pendingInvitations.some(
          invitation =>
            String(
              typeof invitation.inviteeId === 'object'
                ? invitation.inviteeId.id
                : invitation.inviteeId
            ) === user.id
        )
      ) {
        throw new Error('A pending invitation already exists for this user.')
      }
      setAvailableUser(user)
    } catch (error: any) {
      addToast({ title: 'User could not be found', description: error.message, type: 'error' })
    } finally {
      setIsSearchingUser(false)
    }
  }

  const inviteAvailableUser = async () => {
    if (!id || !availableUser) return
    try {
      const invitation = await sendProjectInvitation(id, availableUser.id)
      setPendingInvitations(current => [invitation, ...current])
      setAvailableUser(null)
      setEmail('')
      addToast({
        title: 'Invitation sent',
        description: `${availableUser.name} can accept the project invitation from their notifications.`,
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Invitation could not be sent', description: error.message, type: 'error' })
    }
  }

  const updateMemberRole = async (memberId: string, role: 'manager' | 'member') => {
    if (!id) return
    try {
      const updatedProject = await apiRequest<ApiProject>(
        `/api/projects/${id}/members/${memberId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }
      )
      setProject(updatedProject)
      addToast({
        title: 'Member role updated',
        description: 'The project permissions were updated.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Role could not be updated', description: error.message, type: 'error' })
    }
  }

  const cancelInvitation = async (invitationId: string, inviteeName: string) => {
    if (!id || !window.confirm(`Cancel the invitation for ${inviteeName}?`)) return
    setIsCancellingInvitation(invitationId)
    try {
      await cancelProjectInvitation(id, invitationId)
      setPendingInvitations(current => current.filter(invitation => invitation.id !== invitationId))
      addToast({
        title: 'Invitation cancelled',
        description: 'The pending invitation was withdrawn.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({
        title: 'Invitation could not be cancelled',
        description: error.message,
        type: 'error',
      })
    } finally {
      setIsCancellingInvitation(null)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!id) return
    const member = project?.members.find(
      item => String(typeof item.userId === 'object' ? item.userId.id : item.userId) === memberId
    )
    const memberName = typeof member?.userId === 'object' ? member.userId.name : 'this member'
    if (!window.confirm(`Remove ${memberName} from this project?`)) return
    setIsRemovingMember(memberId)
    try {
      const updatedProject = await apiRequest<ApiProject>(
        `/api/projects/${id}/members/${memberId}`,
        { method: 'DELETE' }
      )
      setProject(updatedProject)
      addToast({
        title: 'Member removed',
        description: 'The member no longer has access to this project.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({ title: 'Member could not be removed', description: error.message, type: 'error' })
    } finally {
      setIsRemovingMember(null)
    }
  }

  const saveGithubRepository = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!id || !githubOwner.trim() || !githubName.trim()) {
      addToast({
        title: 'Repository details required',
        description: 'Enter both the GitHub owner and repository name.',
        type: 'error',
      })
      return
    }

    setIsGithubSaving(true)
    try {
      const updatedProject = await apiRequest<ApiProject>(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ github: { owner: githubOwner.trim(), name: githubName.trim() } }),
      })
      setProject(updatedProject)
      setGithubOwner(updatedProject.github?.owner || '')
      setGithubName(updatedProject.github?.name || '')
      addToast({
        title: 'GitHub repository connected',
        description: `${updatedProject.github?.owner}/${updatedProject.github?.name}`,
        type: 'success',
      })
    } catch (error: any) {
      addToast({
        title: 'GitHub repository could not be connected',
        description: error.message,
        type: 'error',
      })
    } finally {
      setIsGithubSaving(false)
    }
  }

  const disconnectGithubRepository = async () => {
    if (!id) return
    setIsGithubSaving(true)
    try {
      const updatedProject = await apiRequest<ApiProject>(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ github: null }),
      })
      setProject(updatedProject)
      setGithubOwner('')
      setGithubName('')
      addToast({
        title: 'GitHub repository disconnected',
        description: 'Future webhook events will no longer match this project.',
        type: 'success',
      })
    } catch (error: any) {
      addToast({
        title: 'GitHub repository could not be disconnected',
        description: error.message,
        type: 'error',
      })
    } finally {
      setIsGithubSaving(false)
    }
  }

  if (isLoading) return <LoadingState label="Loading project..." />
  if (loadError)
    return (
      <ErrorState
        title="Unable to load project"
        description={loadError}
        onRetry={() => void load()}
      />
    )
  if (!project)
    return (
      <EmptyState
        title="Project not found"
        description="This project may have been deleted or you no longer have access."
      />
    )

  const completed = tasks.filter(task => task.status === 'done').length
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
  const inProgress = tasks.filter(task => task.status === 'in_progress').length
  const reviewTasks = tasks.filter(task => task.status === 'ready_for_review')
  const blocked = tasks.filter(task => task.status === 'blocked').length

  const ownerId = typeof project.ownerId === 'string' ? project.ownerId : project.ownerId.id
  const currentMember = project.members?.find(member => {
    const memberId = typeof member.userId === 'string' ? member.userId : member.userId.id
    return memberId === currentUser?.id
  })
  const canManageMembers = currentUser?.id === ownerId || currentMember?.role === 'manager'
  const canEditMemberRoles = currentUser?.id === ownerId

  const healthVariant =
    health?.status === 'Healthy'
      ? 'success'
      : health?.status === 'At Risk'
      ? 'warning'
      : 'destructive'
  const summaryMetrics = [
    { label: 'Total tasks', value: tasks.length },
    { label: 'Completed', value: completed },
    { label: 'In progress', value: inProgress },
    { label: 'Ready for review', value: reviewTasks.length },
    { label: 'Blocked', value: blocked },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Projects', to: '/projects' }, { label: project.name }]}
        title={project.name}
        description={project.description || 'No description provided.'}
        meta={
          <>
            {health && (
              <Badge variant={healthVariant}>
                {health.status === 'Healthy' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {health.status}
              </Badge>
            )}
            <Badge variant="secondary">{formatCount(tasks.length, 'task')}</Badge>
            <Badge variant="secondary">{formatCount(project.members?.length || 0, 'member')}</Badge>
            {project.github?.owner && project.github?.name ? (
              <Badge variant="success">
                <Github className="h-3 w-3" />
                {project.github.owner}/{project.github.name}
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Github className="h-3 w-3" />
                Not connected
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {canManageMembers && (
              <Button
                variant="outline"
                onClick={() => {
                  setAvailableUser(null)
                  setEmail('')
                  setIsAddOpen(true)
                }}
              >
                <UserPlus aria-hidden />
                Invite
              </Button>
            )}
            <Button asChild>
              <Link to={`/projects/${id}/tasks?create=1`}>
                <Plus aria-hidden />
                Create task
              </Link>
            </Button>
          </>
        }
      />

      <ProjectTabs projectId={id!} active="overview" />

      <section
        aria-label="Project task summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {summaryMetrics.map(metric => (
          <div key={metric.label} className="rounded-lg border bg-card p-4 shadow-xs">
            <p className="text-2xl font-semibold leading-none tabular">{metric.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{metric.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <div className="min-w-0 space-y-5">
          <Card elevation="xs">
            <CardHeader className="border-b">
              <CardTitle>Progress</CardTitle>
              <span className="text-sm text-muted-foreground">
                {formatCount(completed, 'task')} of {tasks.length} complete
              </span>
            </CardHeader>
            <CardContent className="pt-4">
              <ProgressBar value={progress} showLabel label="Completion" />
              {tasks.length === 0 ? (
                <EmptyState
                  variant="inline"
                  title="No tasks yet"
                  description="Create the first task to start tracking progress."
                  action={
                    <Button size="sm" asChild>
                      <Link to={`/projects/${id}/tasks?create=1`}>
                        <Plus aria-hidden />
                        Create task
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="mt-5 space-y-1.5">
                  {tasks.slice(0, 5).map(task => (
                    <li key={task.id}>
                      <Link
                        to={`/tasks/${task.id}`}
                        className="group flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors hover:border-primary/35 hover:bg-accent/40"
                      >
                        <span className="flex min-w-0 items-baseline gap-2">
                          {task.taskKey && (
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {task.taskKey}
                            </span>
                          )}
                          <span className="truncate text-sm transition-colors group-hover:text-primary">
                            {task.title}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <PriorityBadge priority={task.priority} showIcon={false} size="sm" />
                          <StatusBadge status={task.status} showIcon={false} size="sm" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            {tasks.length > 5 && (
              <div className="border-t px-5 py-3">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/projects/${id}/tasks`}>View all {tasks.length} tasks</Link>
                </Button>
              </div>
            )}
          </Card>

          <section id="activity" className="min-w-0">
            <ProjectActivityTimeline projectId={id!} compact />
          </section>
        </div>

        <div className="space-y-5">
          {/* Proof of Work review queue — the reviewer's entry point. */}
          <Card
            elevation="xs"
            className={cn(reviewTasks.length > 0 && 'border-warning/35 bg-warning-soft/30')}
          >
            <CardHeader>
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                    reviewTasks.length > 0
                      ? 'bg-warning/15 text-warning'
                      : 'bg-success-soft text-success'
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Proof of Work
                  </p>
                  <CardTitle className="mt-1 text-sm">
                    {reviewTasks.length
                      ? `${formatCount(reviewTasks.length, 'task')} awaiting verification`
                      : 'Nothing awaiting verification'}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {reviewTasks.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {reviewTasks.slice(0, 3).map(task => (
                    <li key={task.id}>
                      <Link
                        to={`/tasks/${task.id}`}
                        className="flex min-w-0 items-baseline gap-2 rounded px-1 py-1 text-sm hover:text-primary"
                      >
                        {task.taskKey && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {task.taskKey}
                          </span>
                        )}
                        <span className="truncate">{task.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant={reviewTasks.length ? 'default' : 'outline'} size="sm" asChild>
                <Link to={`/projects/${id}/tasks?status=ready_for_review`}>
                  {reviewTasks.length ? 'Review evidence' : 'Open review queue'}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {health && (
            <Card elevation="xs">
              <CardHeader>
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Project health
                  </p>
                  <CardTitle className="mt-1 text-sm">{health.status}</CardTitle>
                </div>
                <Button variant="ghost" size="xs" asChild>
                  <Link to={`/projects/${id}/health`}>Details</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Overdue', value: health.metrics.overdueTasks },
                    { label: 'Blocked', value: health.metrics.blockedTasks },
                    { label: 'Unassigned', value: health.metrics.unassignedTasks },
                  ].map(metric => (
                    <div key={metric.label} className="rounded-md border bg-muted/40 px-2 py-2.5">
                      <dt className="text-2xs text-muted-foreground">{metric.label}</dt>
                      <dd className="mt-1 text-base font-semibold tabular">{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          <Card elevation="xs">
            <CardHeader>
              <div className="flex min-w-0 items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <CardTitle className="text-sm">Team</CardTitle>
              </div>
              <Badge variant="secondary" size="sm">
                {project.members?.length || 0}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {project.members?.length ? (
                project.members.slice(0, 5).map(member => {
                  const memberUser = typeof member.userId === 'object' ? member.userId : undefined
                  const memberId = memberUser ? memberUser.id : String(member.userId)
                  const memberName = memberUser?.name || memberId
                  return (
                    <div key={memberId} className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        name={memberName}
                        src={memberUser?.avatarUrl}
                        size="xs"
                        online={onlineUserIds.has(memberId)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{memberName}</span>
                      {member.role !== 'member' && (
                        <Badge
                          variant={member.role === 'owner' ? 'primary' : 'secondary'}
                          size="sm"
                          className="capitalize"
                        >
                          {member.role}
                        </Badge>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">No members have been added yet.</p>
              )}
              {(project.members?.length || 0) > 5 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  +{project.members.length - 5} more
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Members management */}
      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="min-w-0">
            <CardTitle>Members</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              People with access to this project.
            </p>
          </div>
          {canManageMembers && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAvailableUser(null)
                setEmail('')
                setIsAddOpen(true)
              }}
            >
              <UserPlus aria-hidden />
              Invite member
            </Button>
          )}
        </CardHeader>
        <div className="divide-y">
          {project.members?.map(member => {
            const memberUser = typeof member.userId === 'object' ? member.userId : undefined
            const memberId = memberUser ? memberUser.id : String(member.userId)
            const memberName = memberUser?.name || memberId
            const canRemove =
              canManageMembers &&
              member.role !== 'owner' &&
              (currentUser?.id === ownerId || member.role === 'member')
            return (
              <div
                key={memberId}
                className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/30"
              >
                <Avatar
                  name={memberName}
                  src={memberUser?.avatarUrl}
                  size="sm"
                  online={onlineUserIds.has(memberId)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{memberName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {memberUser?.email || ''}
                  </p>
                </div>
                <Badge
                  variant={member.role === 'owner' ? 'primary' : 'secondary'}
                  size="sm"
                  className="capitalize"
                >
                  {member.role}
                </Badge>
                {canEditMemberRoles && member.role !== 'owner' && (
                  <Select
                    aria-label={`Role for ${memberName}`}
                    value={member.role}
                    onChange={event =>
                      void updateMemberRole(memberId, event.target.value as 'manager' | 'member')
                    }
                    className="h-8 w-28 text-xs"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                  </Select>
                )}
                {canRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${memberName}`}
                    disabled={isRemovingMember === memberId}
                    onClick={() => void removeMember(memberId)}
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {canManageMembers && pendingInvitations.length > 0 && (
          <div className="border-t">
            <p className="px-5 pb-2 pt-4 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Pending invitations
            </p>
            <div className="divide-y border-t">
              {pendingInvitations.map(invitation => {
                const invitee =
                  typeof invitation.inviteeId === 'object' ? invitation.inviteeId : undefined
                const inviteeName = invitee?.name || 'Invited user'
                return (
                  <div key={invitation.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={inviteeName} src={invitee?.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inviteeName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {invitee?.email || 'Invitation pending'}
                      </p>
                    </div>
                    <Badge variant="warning" size="sm">
                      Pending
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Cancel invitation for ${inviteeName}`}
                      disabled={isCancellingInvitation === invitation.id}
                      onClick={() => void cancelInvitation(invitation.id, inviteeName)}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* GitHub integration */}
      <Card elevation="xs" id="github">
        <CardHeader className="border-b">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <Github className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>GitHub integration</CardTitle>
                <Badge variant={project.github ? 'success' : 'secondary'} size="sm" dot>
                  {project.github ? 'Connected' : 'Not connected'}
                </Badge>
              </div>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {project.github
                  ? 'Commits and pull requests that reference a task are recorded as verified development evidence.'
                  : 'Connect a repository so commits and pull requests can be verified against tasks.'}
              </p>
            </div>
          </div>
          {project.github?.url && (
            <Button variant="outline" size="sm" asChild>
              <a href={project.github.url} target="_blank" rel="noreferrer">
                Open repository
                <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </CardHeader>

        <CardContent className="pt-4">
          {project.github && (
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Owner', value: project.github.owner },
                { label: 'Repository', value: project.github.name },
                {
                  label: 'Webhook',
                  // "Connected" only means someone typed a repository name.
                  // This says whether GitHub has actually reached the server.
                  value: project.github.lastDeliveryAt
                    ? `Last delivery ${formatDateTime(project.github.lastDeliveryAt)}`
                    : 'No deliveries received yet',
                  tone: project.github.lastDeliveryAt ? 'ok' : 'pending',
                },
              ].map(detail => (
                <div key={detail.label} className="rounded-md border bg-muted/40 px-3 py-2.5">
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {detail.label}
                  </dt>
                  <dd
                    className={cn(
                      'mt-1 truncate text-sm font-medium',
                      detail.tone === 'ok' && 'text-success',
                      detail.tone === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <details ref={githubDetailsRef} className="group mt-4 rounded-md border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/40">
              Repository settings and webhook details
              <span
                className="text-xs text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              >
                ▾
              </span>
            </summary>
            <div className="space-y-5 border-t px-4 py-4">
              {canManageMembers && (
                <form onSubmit={saveGithubRepository} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Repository owner"
                      value={githubOwner}
                      onChange={event => setGithubOwner(event.target.value)}
                      placeholder="organization or user"
                    />
                    <Input
                      label="Repository name"
                      value={githubName}
                      onChange={event => setGithubName(event.target.value)}
                      placeholder="repository-name"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" loading={isGithubSaving}>
                      <Save aria-hidden />
                      {project.github ? 'Update repository' : 'Connect repository'}
                    </Button>
                    {project.github && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isGithubSaving}
                        onClick={() => void disconnectGithubRepository()}
                      >
                        <Link2Off aria-hidden />
                        Disconnect
                      </Button>
                    )}
                  </div>
                </form>
              )}

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium">Webhook endpoint</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add this URL to the repository&apos;s webhook settings. The signing secret stays
                  on the server and is never shown here.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                    {webhookUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Copy webhook URL"
                    onClick={() => {
                      void navigator.clipboard?.writeText(webhookUrl)
                      addToast({
                        title: 'Webhook URL copied',
                        description: 'Paste it into the GitHub webhook settings.',
                        type: 'success',
                      })
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
                <p className="mt-2.5 text-sm text-muted-foreground">
                  Events: <span className="font-medium text-foreground">Pushes</span> and{' '}
                  <span className="font-medium text-foreground">Pull requests</span>
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium">Task linking</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reference{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">TASK-123</code>{' '}
                  in a branch, commit, or pull request to attach GitHub activity to that task.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">PR opened:</span> To do → In
                    progress
                  </li>
                  <li>
                    <span className="font-medium text-foreground">PR merged:</span> evidence
                    updates, but a reviewer must still approve completion
                  </li>
                </ul>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Invite project member"
        description="Search for a registered user by email, then send them an invitation."
      >
        <form
          onSubmit={event => {
            event.preventDefault()
            void searchAvailableUser()
          }}
          className="space-y-4"
        >
          <Input
            label="Registered user email"
            type="email"
            value={email}
            onChange={event => {
              setEmail(event.target.value)
              setAvailableUser(null)
            }}
            placeholder="user@example.com"
            helperText="Searches active registered users only."
            required
          />
          <Button type="submit" variant="outline" size="sm" loading={isSearchingUser}>
            <Search aria-hidden />
            Find user
          </Button>

          {availableUser && (
            <div className="animate-slide-up flex items-center gap-3 rounded-md border bg-muted/40 p-3">
              <Avatar name={availableUser.name} src={availableUser.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{availableUser.name}</p>
                <p className="truncate text-xs text-muted-foreground">{availableUser.email}</p>
              </div>
              <Button type="button" size="sm" onClick={() => void inviteAvailableUser()}>
                Send invite
              </Button>
            </div>
          )}
        </form>
      </Modal>
    </div>
  )
}
