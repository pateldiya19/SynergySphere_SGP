import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GitCommit,
  GitPullRequest,
  History,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  addTaskDependency,
  apiRequest,
  ApiTask,
  ApiTaskAttachment,
  ApiTaskHistory,
  deleteTaskAttachment,
  fetchTaskAttachment,
  removeTaskDependency,
  reviewTaskProof,
  submitTaskProof,
  updateTaskStatus,
  uploadTaskAttachment,
} from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'
import { PriorityBadge, StatusBadge } from '@/components/tasks/TaskBadges'
import { GitHubDevelopmentPanel } from '@/components/tasks/GitHubDevelopmentPanel'
import { TaskComments } from '@/components/tasks/TaskComments'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { joinProjectRoom, onTaskActivity, onTaskEvent } from '@/lib/socket'
import {
  canReviewTaskProof,
  canStartOrResumeTask,
  canSubmitTaskProof,
  getTaskNextAction,
} from '@/lib/task-proof-workflow'
import { formatProjectRepository, getTaskVerification } from '@/lib/task-verification'
import { cn, formatCount, formatDate, formatDateTime, formatStatus } from '@/lib/utils'

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
function activityIcon(type: string) {
  if (type === 'GIT_COMMIT') return <GitCommit className="h-4 w-4 text-emerald-500" />
  if (type.startsWith('PULL_REQUEST')) return <GitPullRequest className="h-4 w-4 text-primary" />
  return <History className="h-4 w-4 text-sky-500" />
}

function activityTitle(item: ApiTaskHistory): string {
  if (item.type === 'GIT_COMMIT') return 'Commit detected'
  if (item.type === 'PULL_REQUEST_CREATED') return 'Pull request opened'
  if (item.type === 'PULL_REQUEST_MERGED') return 'Pull request merged'
  if (item.type === 'PULL_REQUEST_CLOSED') return 'Pull request closed'
  if (item.type === 'PULL_REQUEST_UPDATED') return 'Pull request updated'
  return item.description
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<ApiTask | null>(null)
  const [projectTasks, setProjectTasks] = useState<ApiTask[]>([])
  const [selectedDependencyId, setSelectedDependencyId] = useState('')
  const [isDependencySaving, setIsDependencySaving] = useState(false)
  const [isAttachmentSaving, setIsAttachmentSaving] = useState(false)
  const [isProofSaving, setIsProofSaving] = useState(false)
  const [proofType, setProofType] = useState<
    'github_pr' | 'github_commit' | 'demo_url' | 'developer_notes'
  >('demo_url')
  const [proofUrl, setProofUrl] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const proofSectionRef = useRef<HTMLDivElement>(null)
  const [history, setHistory] = useState<ApiTaskHistory[]>([])
  const [error, setError] = useState('')
  const { addToast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    if (!id) return
    let active = true
    const load = async () => {
      try {
        const [nextTask, nextHistory] = await Promise.all([
          apiRequest<ApiTask>(`/api/tasks/${id}`),
          apiRequest<ApiTaskHistory[]>(`/api/tasks/${id}/history`),
        ])
        const projectId =
          typeof nextTask.projectId === 'string' ? nextTask.projectId : nextTask.projectId?.id
        const nextProjectTasks = projectId
          ? await apiRequest<ApiTask[]>(`/api/tasks/project/${projectId}?limit=100`)
          : []
        if (active) {
          setTask(nextTask)
          setHistory(nextHistory || [])
          setProjectTasks(nextProjectTasks || [])
        }
      } catch {
        if (active) setError('Unable to load task details. Please try again.')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id])

  const saveDependency = async () => {
    if (!id || !selectedDependencyId) return
    setIsDependencySaving(true)
    try {
      const updatedTask = await addTaskDependency(id, selectedDependencyId)
      setTask(current =>
        current ? { ...current, dependencies: updatedTask.dependencies || [] } : current
      )
      setSelectedDependencyId('')
      addToast({
        title: 'Dependency added',
        description: 'The task now waits for the selected task.',
        type: 'success',
      })
    } catch (requestError: any) {
      addToast({
        title: 'Dependency could not be added',
        description: requestError.message,
        type: 'error',
      })
    } finally {
      setIsDependencySaving(false)
    }
  }

  const deleteDependency = async (dependencyId: string) => {
    if (!id) return
    setIsDependencySaving(true)
    try {
      const updatedTask = await removeTaskDependency(id, dependencyId)
      setTask(current =>
        current ? { ...current, dependencies: updatedTask.dependencies || [] } : current
      )
      addToast({
        title: 'Dependency removed',
        description: 'The task dependency was removed.',
        type: 'success',
      })
    } catch (requestError: any) {
      addToast({
        title: 'Dependency could not be removed',
        description: requestError.message,
        type: 'error',
      })
    } finally {
      setIsDependencySaving(false)
    }
  }

  const uploadAttachment = async (file?: File) => {
    if (!id || !file) return
    if (file.size > 10 * 1024 * 1024) {
      addToast({
        title: 'File is too large',
        description: 'Attachments must be 10 MB or smaller.',
        type: 'error',
      })
      return
    }
    setIsAttachmentSaving(true)
    try {
      const attachment = await uploadTaskAttachment(id, file)
      setTask(current =>
        current
          ? { ...current, attachments: [...(current.attachments || []), attachment] }
          : current
      )
      addToast({ title: 'Attachment uploaded', description: file.name, type: 'success' })
    } catch (requestError: any) {
      addToast({
        title: 'Attachment upload failed',
        description: requestError.message,
        type: 'error',
      })
    } finally {
      setIsAttachmentSaving(false)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ''
    }
  }

  const removeAttachment = async (attachment: ApiTaskAttachment) => {
    if (!id) return
    setIsAttachmentSaving(true)
    try {
      await deleteTaskAttachment(id, attachment.id)
      setTask(current =>
        current
          ? {
              ...current,
              attachments: (current.attachments || []).filter(item => item.id !== attachment.id),
            }
          : current
      )
      addToast({ title: 'Attachment deleted', description: attachment.filename, type: 'success' })
    } catch (requestError: any) {
      addToast({
        title: 'Attachment could not be deleted',
        description: requestError.message,
        type: 'error',
      })
    } finally {
      setIsAttachmentSaving(false)
    }
  }

  const openAttachment = async (attachment: ApiTaskAttachment, preview: boolean) => {
    if (!id) return
    const previewWindow = preview ? window.open('', '_blank') : null
    try {
      const blob = await fetchTaskAttachment(id, attachment.id)
      const objectUrl = URL.createObjectURL(blob)
      if (previewWindow) {
        previewWindow.location.href = objectUrl
      } else {
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = attachment.filename
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (requestError: any) {
      previewWindow?.close()
      addToast({
        title: 'Attachment could not be opened',
        description: requestError.message,
        type: 'error',
      })
    }
  }

  const startTask = async () => {
    if (!id) return
    try {
      const updatedTask = await updateTaskStatus(id, 'in_progress')
      setTask(current =>
        current ? { ...current, ...updatedTask, projectId: current.projectId } : updatedTask
      )
    } catch (requestError: any) {
      addToast({
        title: 'Task could not be started',
        description: requestError.message,
        type: 'error',
      })
    }
  }

  const submitProof = async (proof: {
    type: 'github' | 'demo_url' | 'developer_notes'
    url?: string
    notes?: string
  }) => {
    if (!id) return
    setIsProofSaving(true)
    try {
      const updatedTask = await submitTaskProof(id, proof)
      setTask(current =>
        current ? { ...current, ...updatedTask, projectId: current.projectId } : updatedTask
      )
      setProofUrl('')
      setProofNotes('')
      addToast({
        title: 'Proof submitted',
        description: 'Your task is now ready for review.',
        type: 'success',
      })
    } catch (requestError: any) {
      addToast({
        title: 'Proof could not be submitted',
        description: requestError.message,
        type: 'error',
      })
    } finally {
      setIsProofSaving(false)
    }
  }

  const reviewProof = async (decision: 'approved' | 'changes_requested') => {
    if (!id) return
    setIsProofSaving(true)
    try {
      const updatedTask = await reviewTaskProof(id, decision, reviewComment.trim() || undefined)
      setTask(current =>
        current ? { ...current, ...updatedTask, projectId: current.projectId } : updatedTask
      )
      setReviewComment('')
      addToast({
        title: decision === 'approved' ? 'Task approved' : 'Changes requested',
        description:
          decision === 'approved' ? 'The task is complete.' : 'The assignee has been notified.',
        type: 'success',
      })
    } catch (requestError: any) {
      addToast({
        title: 'Review could not be saved',
        description: requestError.message,
        type: 'error',
      })
    } finally {
      setIsProofSaving(false)
    }
  }

  const taskProjectId = typeof task?.projectId === 'string' ? task.projectId : task?.projectId?.id
  useEffect(() => {
    if (!taskProjectId || !id) return
    const leaveProject = joinProjectRoom(taskProjectId)
    const stop = onTaskActivity(payload => {
      if (payload.taskId !== id) return
      setHistory(current => [...current, payload.activity])
    })
    const stopTaskEvents = onTaskEvent(payload => {
      if (payload.task?.id !== id && payload.taskId !== id) return
      if (payload.attachmentChanged) {
        void apiRequest<ApiTask>(`/api/tasks/${id}`)
          .then(updatedTask => {
            setTask(current =>
              current ? { ...current, attachments: updatedTask.attachments || [] } : current
            )
          })
          .catch((requestError: Error) =>
            addToast({
              title: 'Attachments could not be refreshed',
              description: requestError.message,
              type: 'error',
            })
          )
        return
      }
      if (payload.task)
        setTask(current => (current ? { ...current, ...payload.task } : payload.task))
      if (payload.taskId === id && payload.task === undefined) navigate(-1)
    })
    return () => {
      stop()
      stopTaskEvents()
      leaveProject()
    }
  }, [taskProjectId, id])

  if (error)
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <h2 className="font-semibold">Task details could not be loaded</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    )
  if (!task)
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border p-6 text-sm text-muted-foreground"
      >
        Loading task details...
      </div>
    )

  const dependencies = task.dependencies || []
  const availableDependencies = projectTasks.filter(
    candidate =>
      candidate.id !== task.id && !dependencies.some(dependency => dependency.id === candidate.id)
  )
  const hasIncompleteDependencies = dependencies.some(dependency => dependency.status !== 'done')
  const project = typeof task.projectId === 'string' ? undefined : task.projectId
  const currentUserId = user?.id || ''
  const assigneeId = typeof task.assigneeId === 'string' ? task.assigneeId : task.assigneeId?.id
  const projectOwnerId =
    typeof project?.ownerId === 'string' ? project.ownerId : project?.ownerId?.id
  const isAssignee = Boolean(currentUserId && assigneeId === currentUserId)
  const isReviewer = Boolean(
    currentUserId &&
      (projectOwnerId === currentUserId ||
        project?.members?.some(member => {
          const memberId = typeof member.userId === 'string' ? member.userId : member.userId.id
          return memberId === currentUserId && member.role === 'manager'
        }))
  )
  const canSubmitProof = canSubmitTaskProof(task.status, isAssignee)
  const canStartOrResume = canStartOrResumeTask(task.status, isAssignee)
  const canReviewProof = canReviewTaskProof(task.status, isReviewer)
  const githubProofs = (task.proofOfWork || []).filter(proof => proof.type === 'github')
  const projectRepository = formatProjectRepository(project?.github)
  const assigneeName = typeof task.assigneeId === 'object' ? task.assigneeId?.name : undefined
  const verification = getTaskVerification(githubProofs, projectRepository)
  const evidenceProof = verification.evidenceProof
  const evidenceVerified = verification.status === 'verified'
  const workflowSteps = [
    'TODO',
    'IN PROGRESS',
    'DEVELOPMENT',
    'READY FOR REVIEW',
    'VERIFIED',
    'DONE',
  ]
  const activeWorkflowStep =
    task.status === 'done'
      ? 5
      : task.status === 'ready_for_review'
      ? 3
      : task.status === 'todo'
      ? 0
      : task.status === 'in_progress'
      ? verification.status === 'none'
        ? 1
        : 2
      : 1
  const activeProofType =
    task.requiresGitHubEvidence && !proofType.startsWith('github') ? 'github_pr' : proofType
  const hasGitHubEvidence = githubProofs.some(proof =>
    Boolean(proof.url || proof.pullRequestNumber || proof.commits?.length)
  )
  const focusProofSection = () =>
    proofSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const nextActionText = getTaskNextAction(
    task.status,
    task.taskKey || 'this task',
    Boolean(task.requiresGitHubEvidence),
    hasGitHubEvidence,
    isAssignee
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft aria-hidden />
        Back
      </Button>

      <PageHeader
        breadcrumbs={[
          { label: 'Projects', to: '/projects' },
          ...(project ? [{ label: project.name, to: `/projects/${project.id}` }] : []),
          { label: task.taskKey || 'Task' },
        ]}
        title={task.title}
        description={task.description || 'No description provided.'}
        meta={
          <>
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.requiresGitHubEvidence && (
              <Badge variant="info">
                <ShieldCheck className="h-3 w-3" />
                Evidence required
              </Badge>
            )}
          </>
        }
      />

      <Card elevation="xs">
        <CardContent className="pt-5">
          <dl className="grid gap-5 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Assignee
              </dt>
              <dd className="mt-2 flex min-w-0 items-center gap-2 text-sm font-medium">
                {task.assigneeId && typeof task.assigneeId === 'object' ? (
                  <>
                    <Avatar name={task.assigneeId.name} src={task.assigneeId.avatarUrl} size="xs" />
                    <span className="truncate">{task.assigneeId.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Due date
              </dt>
              <dd
                className={cn(
                  'mt-2 flex items-center gap-2 text-sm font-medium',
                  task.dueDate &&
                    task.status !== 'done' &&
                    new Date(task.dueDate) < new Date() &&
                    'text-destructive'
                )}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {task.dueDate ? (
                  formatDate(task.dueDate)
                ) : (
                  <span className="text-muted-foreground">No due date</span>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Project
              </dt>
              <dd className="mt-2 truncate text-sm font-medium">
                {project?.name || 'Project task'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Verification summary: the reviewer's at-a-glance trust signal. */}
      {(task.requiresGitHubEvidence || githubProofs.length > 0) && (
        <Card
          elevation="sm"
          aria-label="GitHub verification summary"
          className={cn(
            evidenceVerified && 'border-success/35 bg-success-soft/30',
            verification.status === 'self_reported' && 'border-warning/35 bg-warning-soft/30'
          )}
        >
          <CardHeader>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Development verification</CardTitle>
                <Badge
                  variant={
                    evidenceVerified
                      ? 'success'
                      : verification.status === 'self_reported'
                      ? 'warning'
                      : 'secondary'
                  }
                  dot
                >
                  {evidenceVerified
                    ? 'Verified by GitHub'
                    : verification.status === 'self_reported'
                    ? 'Self-reported'
                    : 'Awaiting GitHub'}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {evidenceVerified
                  ? 'Evidence received from GitHub. Project manager review is still required.'
                  : verification.status === 'self_reported'
                  ? 'This evidence has not been verified by the system.'
                  : 'GitHub development evidence will appear here when detected.'}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular">
              {verification.passedCount}/{verification.totalCount} checks
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="grid gap-x-5 border-t sm:grid-cols-2 lg:grid-cols-4">
              {verification.checks.map(check => (
                <li key={check.key} className="flex min-w-0 items-center gap-2 py-2.5 text-xs">
                  {check.state === 'pass' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : check.state === 'fail' ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  ) : (
                    <span className="w-4 shrink-0 text-center text-muted-foreground" aria-hidden>
                      —
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{check.label}</span>
                  <span
                    className={cn(
                      'shrink-0 font-semibold',
                      check.state === 'pass'
                        ? 'text-success'
                        : check.state === 'fail'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    )}
                  >
                    {check.state === 'pass'
                      ? 'Verified'
                      : check.state === 'fail'
                      ? 'Failed'
                      : 'Not verified'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Workflow + next action */}
      <Card elevation="xs">
        <CardContent className="space-y-4 pt-5">
          <div>
            <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Verification workflow
            </h2>
            <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {workflowSteps.map((step, index) => (
                <li key={step} className="min-w-0">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-colors',
                      index <= activeWorkflowStep ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                  <p
                    className={cn(
                      'mt-2 break-words text-2xs leading-tight',
                      index === activeWorkflowStep
                        ? 'font-bold text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {task.status === 'ready_for_review' && (
            <div
              className={cn(
                'rounded-lg border p-4',
                isReviewer ? 'border-primary/40 bg-primary-soft/40' : 'border-border bg-muted/30'
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck
                  className={cn(
                    'h-5 w-5 shrink-0',
                    isReviewer ? 'text-primary' : 'text-muted-foreground'
                  )}
                  aria-hidden
                />
                <h3 className="text-base font-semibold">Ready for review</h3>
                <Badge variant={verification.status === 'verified' ? 'success' : 'warning'}>
                  {verification.status === 'verified' ? 'Evidence verified' : 'Evidence unverified'}
                </Badge>
                {isReviewer && (
                  <Badge variant="primary" className="ml-auto">
                    Your action required
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {verification.status === 'verified'
                  ? 'Development evidence has been submitted and verified. Review the GitHub activity before approving this task.'
                  : 'Development evidence has been submitted but GitHub has not verified it. Review the activity carefully before approving.'}
              </p>

              <dl className="mt-4 grid gap-3 border-t pt-3.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Developer
                  </dt>
                  <dd className="mt-1 truncate font-medium">
                    {evidenceProof?.pullRequestAuthor
                      ? evidenceProof.authorMatchesAssignee === true && assigneeName
                        ? assigneeName
                        : `@${evidenceProof.pullRequestAuthor}`
                      : 'Not verified'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Pull request
                  </dt>
                  <dd className="mt-1 truncate font-medium">
                    {evidenceProof?.pullRequestNumber
                      ? `#${evidenceProof.pullRequestNumber}${
                          evidenceProof.pullRequestTitle
                            ? ` · ${evidenceProof.pullRequestTitle}`
                            : ''
                        }`
                      : 'Not verified'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Commits
                  </dt>
                  <dd className="mt-1 font-medium tabular">
                    {evidenceProof?.commitCount !== undefined ||
                    evidenceProof?.commits !== undefined
                      ? formatCount(
                          evidenceProof.commitCount ?? evidenceProof.commits?.length ?? 0,
                          'commit'
                        )
                      : 'Not verified'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Code changes
                  </dt>
                  <dd className="mt-1 font-medium">
                    {evidenceProof?.filesChanged === undefined
                      ? 'Not verified'
                      : formatCount(evidenceProof.filesChanged, 'file', 'files')}
                    {evidenceProof?.additions !== undefined && evidenceProof.deletions !== undefined
                      ? ` · +${evidenceProof.additions} / -${evidenceProof.deletions}`
                      : ''}
                  </dd>
                </div>
              </dl>

              {evidenceProof?.url && (
                <a
                  href={evidenceProof.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View GitHub pull request
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {canReviewProof && (
                <div className="mt-4 space-y-3 border-t pt-3.5">
                  <Textarea
                    label="Review comment"
                    value={reviewComment}
                    onChange={event => setReviewComment(event.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="Required when requesting changes."
                  />
                  {!evidenceVerified && task.requiresGitHubEvidence && (
                    <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Approval is unavailable until GitHub webhook evidence is verified.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isProofSaving || (task.requiresGitHubEvidence && !evidenceVerified)}
                      loading={isProofSaving}
                      onClick={() => void reviewProof('approved')}
                    >
                      <CheckCircle2 aria-hidden />
                      Approve task
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isProofSaving || !reviewComment.trim()}
                      onClick={() => void reviewProof('changes_requested')}
                    >
                      Request changes
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={focusProofSection}>
                      Review evidence
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Next action</h2>
              <p className="mt-1 text-sm text-muted-foreground">{nextActionText}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {task.status === 'done' && (
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </Badge>
              )}
              {canStartOrResume && (
                <Button type="button" size="sm" onClick={() => void startTask()}>
                  {task.status === 'changes_requested' ? 'Resume work' : 'Start work'}
                </Button>
              )}
              {task.status === 'in_progress' && isAssignee && (
                <Button type="button" size="sm" onClick={focusProofSection}>
                  {task.requiresGitHubEvidence && !hasGitHubEvidence
                    ? 'Add GitHub evidence'
                    : task.requiresGitHubEvidence || hasGitHubEvidence
                    ? 'Submit for review'
                    : 'Submit manual proof'}
                </Button>
              )}
              {task.status === 'ready_for_review' && isReviewer && (
                <Button type="button" size="sm" onClick={focusProofSection}>
                  Review evidence
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dependencies */}
      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="min-w-0">
            <CardTitle>Dependencies</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Required tasks that must be completed first.
            </p>
          </div>
          {dependencies.length > 0 && (
            <Badge variant={hasIncompleteDependencies ? 'warning' : 'success'} size="sm">
              {dependencies.filter(dependency => dependency.status === 'done').length}/
              {dependencies.length} done
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {dependencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dependencies.</p>
          ) : (
            <ul className="space-y-2">
              {dependencies.map(dependency => (
                <li
                  key={dependency.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {dependency.taskKey || 'Task'}
                      </span>
                      <span className="truncate">{dependency.title}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      {dependency.status === 'done' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden />
                      )}
                      <span className="text-muted-foreground">
                        {dependency.status === 'done'
                          ? 'Completed'
                          : `Incomplete: ${formatStatus(dependency.status)}`}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove dependency ${dependency.title}`}
                    disabled={isDependencySaving}
                    onClick={() => void deleteDependency(dependency.id || '')}
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {hasIncompleteDependencies && (
            <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              This task cannot be completed until all dependencies are done.
            </p>
          )}

          {availableDependencies.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
              <Select
                aria-label="Add a dependency"
                value={selectedDependencyId}
                onChange={event => setSelectedDependencyId(event.target.value)}
                className="min-w-0 flex-1"
              >
                <option value="">Add a dependency...</option>
                {availableDependencies.map(candidate => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.taskKey || 'Task'}: {candidate.title}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                disabled={!selectedDependencyId || isDependencySaving}
                loading={isDependencySaving}
                onClick={() => void saveDependency()}
              >
                Add dependency
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proof of Work */}
      <Card elevation="xs" ref={proofSectionRef} className="scroll-mt-20">
        <CardContent className="space-y-4 pt-5">
          {task.requiresGitHubEvidence || githubProofs.length > 0 ? (
            <GitHubDevelopmentPanel
              taskKey={task.taskKey || 'TASK-123'}
              proofs={githubProofs}
              projectRepository={projectRepository}
              assigneeName={assigneeName}
              evidenceRequired={Boolean(task.requiresGitHubEvidence)}
            />
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold">Proof of Work</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  GitHub evidence, demo links, and developer notes submitted for task verification.
                </p>
              </div>
              {(task.proofOfWork || []).length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={ShieldCheck}
                  title="No proof submitted yet"
                  description="The assignee can submit evidence once the task is in progress."
                />
              ) : (
                <div className="space-y-3">
                  {(task.proofOfWork || []).map(proof => {
                    const submitter =
                      typeof proof.submittedBy === 'object' ? proof.submittedBy.name : undefined
                    return (
                      <article key={proof.id} className="space-y-2 rounded-md border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">
                            {proof.type === 'github'
                              ? 'GitHub development evidence'
                              : proof.type === 'demo_url'
                              ? 'Demo URL'
                              : 'Developer notes'}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {proof.source === 'github' ? 'GitHub webhook' : submitter || 'Assignee'}{' '}
                            · {formatDateTime(proof.lastUpdatedAt || proof.submittedAt)}
                          </span>
                        </div>
                        {proof.type === 'github' && (
                          <div className="space-y-2 text-sm">
                            {proof.pullRequestTitle && (
                              <p className="font-medium">
                                {proof.pullRequestNumber ? `PR #${proof.pullRequestNumber}: ` : ''}
                                {proof.pullRequestTitle}
                              </p>
                            )}
                            {proof.url && (
                              <a
                                href={proof.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {proof.pullRequestNumber ? 'View PR' : 'View commit'}
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {proof.branch && (
                              <p className="text-muted-foreground">
                                Branch:{' '}
                                <span className="font-mono text-foreground">{proof.branch}</span>
                              </p>
                            )}
                            {proof.pullRequestAuthor && (
                              <p className="text-muted-foreground">
                                PR author:{' '}
                                <span className="text-foreground">{proof.pullRequestAuthor}</span>
                              </p>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {formatCount(
                                  proof.commitCount ?? proof.commits?.length ?? 0,
                                  'commit'
                                )}
                              </span>
                              <span>
                                {formatCount(proof.filesChanged ?? 0, 'file', 'files')} changed
                              </span>
                              <span className="text-success">+{proof.additions ?? 0}</span>
                              <span className="text-destructive">-{proof.deletions ?? 0}</span>
                              <span className={proof.merged ? 'text-success' : 'text-warning'}>
                                {proof.merged ? 'Merged' : 'Not merged'}
                              </span>
                            </div>
                            {(proof.commits || []).length > 0 && (
                              <ul className="space-y-1 border-l pl-3 text-xs text-muted-foreground">
                                {proof.commits!.map(commit => (
                                  <li key={commit.sha}>
                                    <span className="mr-2 font-mono">{commit.sha.slice(0, 8)}</span>
                                    {commit.url ? (
                                      <a
                                        href={commit.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="hover:text-primary"
                                      >
                                        {commit.message || 'Commit'}
                                      </a>
                                    ) : (
                                      commit.message || 'Commit'
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        {proof.type === 'demo_url' && proof.url && (
                          <a
                            href={proof.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 break-all text-sm text-primary hover:underline"
                          >
                            {proof.url}
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        )}
                        {proof.type === 'developer_notes' && (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {proof.notes}
                          </p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {canSubmitProof && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">
                {task.requiresGitHubEvidence ? 'Submit for review' : 'Submit proof for review'}
              </h3>

              {githubProofs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {githubProofs.map(proof => (
                    <Button
                      key={proof.id}
                      type="button"
                      variant="subtle"
                      size="sm"
                      disabled={isProofSaving}
                      onClick={() => void submitProof({ type: 'github', url: proof.url })}
                    >
                      {proof.pullRequestNumber
                        ? `Submit PR #${proof.pullRequestNumber} for review`
                        : `Submit ${
                            proof.commitCount || proof.commits?.length || 0
                          } linked commits for review`}
                    </Button>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-[13rem_1fr]">
                <Select
                  label="Evidence type"
                  value={activeProofType}
                  onChange={event => setProofType(event.target.value as typeof proofType)}
                >
                  <option value="github_pr">GitHub PR URL</option>
                  <option value="github_commit">GitHub commit URL</option>
                  {!task.requiresGitHubEvidence && (
                    <>
                      <option value="demo_url">Demo URL</option>
                      <option value="developer_notes">Developer notes</option>
                    </>
                  )}
                </Select>

                {activeProofType !== 'developer_notes' ? (
                  <Input
                    label={
                      activeProofType === 'github_pr'
                        ? 'GitHub PR URL'
                        : activeProofType === 'github_commit'
                        ? 'GitHub commit URL'
                        : 'Demo URL'
                    }
                    value={proofUrl}
                    onChange={event => setProofUrl(event.target.value)}
                    type="url"
                    placeholder={
                      activeProofType === 'github_pr'
                        ? 'https://github.com/org/repo/pull/42'
                        : activeProofType === 'github_commit'
                        ? 'https://github.com/org/repo/commit/sha'
                        : 'https://demo.example.com'
                    }
                  />
                ) : (
                  <Textarea
                    label="Developer notes"
                    value={proofNotes}
                    onChange={event => setProofNotes(event.target.value)}
                    rows={3}
                    maxLength={5000}
                    placeholder="Describe the completed work and verification."
                  />
                )}
              </div>

              <Button
                type="button"
                disabled={
                  isProofSaving ||
                  (activeProofType === 'developer_notes' ? !proofNotes.trim() : !proofUrl.trim())
                }
                loading={isProofSaving}
                onClick={() =>
                  void submitProof({
                    type:
                      activeProofType === 'developer_notes' || activeProofType === 'demo_url'
                        ? activeProofType
                        : 'github',
                    url: activeProofType === 'developer_notes' ? undefined : proofUrl,
                    notes: activeProofType === 'developer_notes' ? proofNotes : undefined,
                  })
                }
              >
                {task.requiresGitHubEvidence
                  ? 'Add manual GitHub evidence and send for review'
                  : 'Submit for review'}
              </Button>
            </div>
          )}

          {(task.proofReviews || []).length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Review history</h3>
              {task.proofReviews!.map(review => {
                const reviewer =
                  typeof review.reviewerId === 'object' ? review.reviewerId.name : 'Reviewer'
                const approved = review.decision === 'approved'
                return (
                  <div
                    key={review.id}
                    className={cn(
                      'rounded-md border p-3 text-sm',
                      approved
                        ? 'border-success/25 bg-success-soft/40'
                        : 'border-warning/25 bg-warning-soft/40'
                    )}
                  >
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {approved ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                      )}
                      {approved ? 'Approved' : 'Changes requested'} by {reviewer}
                    </p>
                    {review.comment && (
                      <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                        {review.comment}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatDateTime(review.reviewedAt)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="min-w-0">
            <CardTitle>Attachments</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              PDF and image files, up to 10 MB each.
            </p>
          </div>
          <input
            ref={attachmentInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={event => void uploadAttachment(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isAttachmentSaving}
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Upload aria-hidden />
            Upload file
          </Button>
        </CardHeader>
        {(task.attachments || []).length === 0 ? (
          <EmptyState
            variant="inline"
            icon={FileText}
            title="No attachments"
            description="Upload supporting files for this task."
          />
        ) : (
          <ul className="divide-y">
            {(task.attachments || []).map(attachment => {
              const uploaderName =
                typeof attachment.uploaderId === 'object' ? attachment.uploaderId.name : ''
              const canPreview =
                attachment.mimeType === 'application/pdf' ||
                attachment.mimeType.startsWith('image/')
              return (
                <li
                  key={attachment.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{attachment.filename}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)}
                      {uploaderName ? ` · ${uploaderName}` : ''} ·{' '}
                      {formatDate(attachment.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {canPreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`View ${attachment.filename}`}
                        title="View"
                        onClick={() => void openAttachment(attachment, true)}
                      >
                        <Eye />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Download ${attachment.filename}`}
                      title="Download"
                      onClick={() => void openAttachment(attachment, false)}
                    >
                      <Download />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${attachment.filename}`}
                      title="Delete"
                      disabled={isAttachmentSaving}
                      onClick={() => void removeAttachment(attachment)}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Task comments */}
      <TaskComments taskId={task.id} canModerate={isReviewer} />

      {/* Task history */}
      <Card elevation="xs">
        <CardHeader className="border-b">
          <div className="flex min-w-0 items-center gap-2">
            <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <CardTitle>Activity &amp; history</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Task updates and GitHub development activity.
              </p>
            </div>
          </div>
        </CardHeader>
        {history.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={History}
            title="No activity recorded yet"
            description="Updates appear here as work progresses."
          />
        ) : (
          <CardContent className="pt-5">
            <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[0.9375rem] before:top-2 before:w-px before:bg-border">
              {history.map(item => {
                const metadata = item.metadata || {}
                const isCommit = item.type === 'GIT_COMMIT'
                const isPullRequest = item.type.startsWith('PULL_REQUEST')
                const title = activityTitle(item)
                const pullRequestTitle = typeof metadata.title === 'string' ? metadata.title : ''
                const commitMessage =
                  typeof metadata.message === 'string' ? metadata.message.split('\n')[0] : ''
                const author = typeof metadata.author === 'string' ? metadata.author : ''
                const filesChanged =
                  typeof metadata.changedFiles === 'number' ? metadata.changedFiles : undefined
                const additions =
                  typeof metadata.additions === 'number' ? metadata.additions : undefined
                const deletions =
                  typeof metadata.deletions === 'number' ? metadata.deletions : undefined
                const pullRequestNumber =
                  typeof metadata.pullRequestNumber === 'number'
                    ? metadata.pullRequestNumber
                    : undefined
                return (
                  <article key={item.id} className="relative flex gap-3">
                    <span
                      className={cn(
                        'z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                        item.source === 'github'
                          ? 'bg-info-soft text-info'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {activityIcon(item.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{title}</p>
                        <Badge
                          variant={item.source === 'github' ? 'info' : 'secondary'}
                          size="sm"
                          className="uppercase"
                        >
                          {item.source === 'github' ? 'GitHub' : item.source}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </p>
                      {isCommit && (
                        <p className="mt-2 break-words text-sm">
                          {commitMessage ||
                            item.description.replace(/^Git commit detected:\s*/i, '')}
                        </p>
                      )}
                      {isPullRequest && (
                        <p className="mt-2 break-words text-sm">
                          <span className="font-mono font-semibold">
                            {pullRequestNumber ? `#${pullRequestNumber} ` : ''}
                          </span>
                          {pullRequestTitle || item.description}
                          {author && <span className="text-muted-foreground"> · by @{author}</span>}
                        </p>
                      )}
                      {!isCommit && !isPullRequest && (
                        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                      )}
                      {isCommit && author && (
                        <p className="mt-1 text-xs text-muted-foreground">by {author}</p>
                      )}
                      {typeof metadata.sha === 'string' && (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {metadata.sha.slice(0, 8)}
                        </p>
                      )}
                      {isPullRequest &&
                        (filesChanged !== undefined ||
                          additions !== undefined ||
                          deletions !== undefined) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {filesChanged !== undefined
                              ? `${formatCount(filesChanged, 'file', 'files')} changed`
                              : 'Code changes detected'}
                            {additions !== undefined ? ` · +${additions}` : ''}
                            {deletions !== undefined ? ` / -${deletions}` : ''}
                          </p>
                        )}
                      {typeof metadata.url === 'string' && (
                        <a
                          href={metadata.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View on GitHub
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
