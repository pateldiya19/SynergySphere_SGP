import { ApiTaskStatus } from '@/lib/api'

export function canSubmitTaskProof(status: ApiTaskStatus, isAssignee: boolean): boolean {
  return isAssignee && status === 'in_progress'
}

export function canReviewTaskProof(status: ApiTaskStatus, isReviewer: boolean): boolean {
  return isReviewer && status === 'ready_for_review'
}

export function canStartOrResumeTask(status: ApiTaskStatus, isAssignee: boolean): boolean {
  return isAssignee && (status === 'todo' || status === 'changes_requested')
}

export function getTaskNextAction(
  status: ApiTaskStatus,
  taskKey: string,
  requiresGitHubEvidence: boolean,
  hasGitHubEvidence: boolean,
  isAssignee: boolean
): string {
  if (status === 'done')
    return requiresGitHubEvidence ? '✓ Development verified and task completed' : '✓ Task completed'
  if (status === 'ready_for_review') return 'Next: Manager/Owner Review'
  if (status === 'changes_requested') return 'Next: Resume Work'
  if (status === 'in_progress') {
    if (requiresGitHubEvidence && !hasGitHubEvidence)
      return `Next: Push GitHub work using ${taskKey}`
    if (requiresGitHubEvidence || hasGitHubEvidence) return 'Next: Submit for Review'
    return isAssignee
      ? 'Add manual proof when the work is ready for review.'
      : 'The assignee is working on this task.'
  }
  if (status === 'blocked') return 'Next: Resolve Blocker'
  return isAssignee ? 'Next: Start Work' : 'Waiting for the assignee to start work.'
}
