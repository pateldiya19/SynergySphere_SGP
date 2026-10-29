import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatActivityLabel,
  formatCompactDateTime,
  formatCount,
  formatDate,
  formatDateTime,
  formatRelativeDateTime,
  formatStatus,
} from '@/lib/utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('presentation formatters', () => {
  it('formats full and compact dates in the local timezone', () => {
    const date = new Date(2026, 9, 2, 15, 28)

    expect(formatDate('2026-10-02')).toBe('02 Oct 2026')
    expect(formatDateTime(date)).toBe('02 Oct 2026, 3:28 PM')
    expect(formatCompactDateTime(date)).toBe('02 Oct, 3:28 PM')
  })

  it('uses relative labels for recent activity and absolute labels for older activity', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0))

    expect(formatRelativeDateTime(new Date(2026, 9, 2, 11, 55))).toBe('5 minutes ago')
    expect(formatRelativeDateTime(new Date(2026, 9, 1, 23, 59))).toBe('Yesterday')
    expect(formatRelativeDateTime(new Date(2026, 8, 20, 12, 0))).toBe('20 Sep 2026, 12:00 PM')
  })

  it('humanizes statuses and activity event titles', () => {
    expect(formatStatus('ready_for_review')).toBe('Ready for Review')
    expect(formatStatus('changes_requested')).toBe('Changes Requested')
    expect(formatActivityLabel('PULL_REQUEST_CREATED')).toBe('Pull request opened')
  })

  it('pluralizes counts', () => {
    expect(formatCount(1, 'member')).toBe('1 member')
    expect(formatCount(8, 'member')).toBe('8 members')
    expect(formatCount(1, 'file', 'files')).toBe('1 file')
  })
})
