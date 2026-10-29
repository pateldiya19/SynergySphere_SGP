import { describe, expect, it } from 'vitest'
import { ApiTask } from '@/lib/api'
import { getTimelineBar, getTimelineRange, getTimelineUnitCount } from '@/lib/timeline'

const now = new Date('2026-10-02T12:00:00.000Z')

function task(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    projectId: 'project-1',
    title: 'Timeline task',
    status: 'todo',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('timeline date layout', () => {
  it('includes task dates and today in the range with a weekly margin', () => {
    const range = getTimelineRange([task({ dueDate: '2026-11-01T00:00:00.000Z' })], now)
    expect(range.start.getTime()).toBeLessThan(now.getTime())
    expect(range.end.getTime()).toBeGreaterThan(new Date('2026-11-01T00:00:00.000Z').getTime())
  })

  it('uses day columns for Week and week columns for Month', () => {
    const range = getTimelineRange([task()], now)
    expect(getTimelineUnitCount(range, 'week')).toBeGreaterThan(
      getTimelineUnitCount(range, 'month')
    )
  })

  it('places a dated task across its start-to-due interval', () => {
    const currentTask = task({ dueDate: '2026-10-04T00:00:00.000Z' })
    const range = getTimelineRange([currentTask], now)
    const bar = getTimelineBar(currentTask, range, 'week')
    expect(bar.widthUnits).toBe(3)
    expect(bar.leftUnits).toBeGreaterThanOrEqual(0)
  })

  it('gives tasks without due dates a one-day bar', () => {
    const currentTask = task()
    const range = getTimelineRange([currentTask], now)
    expect(getTimelineBar(currentTask, range, 'week').widthUnits).toBe(1)
  })
})
