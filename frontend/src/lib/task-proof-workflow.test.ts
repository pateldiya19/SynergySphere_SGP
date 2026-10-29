import { describe, expect, it } from 'vitest'
import {
  canReviewTaskProof,
  canStartOrResumeTask,
  canSubmitTaskProof,
  getTaskNextAction,
} from '@/lib/task-proof-workflow'

describe('proof workflow controls', () => {
  it('lets only the assignee submit proof while work is in progress', () => {
    expect(canSubmitTaskProof('in_progress', true)).toBe(true)
    expect(canSubmitTaskProof('todo', true)).toBe(false)
    expect(canSubmitTaskProof('ready_for_review', true)).toBe(false)
    expect(canSubmitTaskProof('in_progress', false)).toBe(false)
  })

  it('lets only reviewers act on tasks waiting for review', () => {
    expect(canReviewTaskProof('ready_for_review', true)).toBe(true)
    expect(canReviewTaskProof('in_progress', true)).toBe(false)
    expect(canReviewTaskProof('ready_for_review', false)).toBe(false)
  })

  it('offers start or resume to the assignee in the appropriate states only', () => {
    expect(canStartOrResumeTask('todo', true)).toBe(true)
    expect(canStartOrResumeTask('changes_requested', true)).toBe(true)
    expect(canStartOrResumeTask('ready_for_review', true)).toBe(false)
    expect(canStartOrResumeTask('changes_requested', false)).toBe(false)
  })

  it('guides GitHub-required work from matching activity through reviewer approval', () => {
    expect(getTaskNextAction('in_progress', 'TASK-123', true, false, true)).toBe(
      'Next: Push GitHub work using TASK-123'
    )
    expect(getTaskNextAction('in_progress', 'TASK-123', true, true, true)).toBe(
      'Next: Submit for Review'
    )
    expect(getTaskNextAction('ready_for_review', 'TASK-123', true, true, false)).toBe(
      'Next: Manager/Owner Review'
    )
    expect(getTaskNextAction('changes_requested', 'TASK-123', true, true, true)).toBe(
      'Next: Resume Work'
    )
    expect(getTaskNextAction('done', 'TASK-123', true, true, false)).toBe(
      '✓ Development verified and task completed'
    )
  })

  it('keeps a manual-proof next step when GitHub evidence is not required', () => {
    expect(getTaskNextAction('in_progress', 'TASK-123', false, false, true)).toBe(
      'Add manual proof when the work is ready for review.'
    )
  })
})
